import http from 'node:http';

// Deterministic responses for the recording only. No service SDK or network client.
export function answer(body) {
  const fields = body.response_format.json_schema.schema.properties;
  const input = JSON.parse(body.messages.find(message => message.role === 'user').content);
  if (fields.claims) return { claims: input.segments.map(segment => ({
    statement: segment.text, originalText: segment.text, segmentIds: [segment.id],
    nodeIds: /distance|closer/.test(segment.text) ? ['sun-distance', 'seasons']
      : /daylight/.test(segment.text) ? ['day-length'] : ['axial-tilt', 'sunlight-angle'],
  })) };
  if (fields.results) return { results: input.claims.map(claim => {
    const error = claim.statement.startsWith('Summer happens because Earth is closer');
    const uncertain = claim.statement.startsWith('I am not sure');
    return {
      claimId: claim.id, status: error ? 'contradicted' : uncertain ? 'uncertain' : 'verified',
      explanation: error ? 'Offline fixture: Earth-Sun distance cannot explain opposite seasons.'
        : uncertain ? 'Offline fixture: the daylight mechanism needs a fuller explanation.' : 'Offline fixture: this statement matches the chosen pack node.',
      sourceRef: `pack:earth-seasons@1.0 node:${claim.nodeIds[0]}`,
      misconceptionId: error ? 'mc-distance' : null,
      repairedClaimIds: claim.statement.startsWith('Actually') ? input.earlierContradictions.map(item => item.id) : [],
    };
  }) };
  if (fields.beliefs) return { beliefs: input.claims.filter(claim => claim.status !== 'superseded').map((claim, index) => ({
    id: input.currentBeliefs[index]?.id ?? 'new', statement: claim.statement,
    supportingClaimIds: [claim.id], nodeIds: claim.nodeIds,
    status: claim.status === 'uncertain' ? 'tentative' : claim.supersedesClaimId ? 'revised' : 'believed',
    ambiguityNote: claim.status === 'uncertain' ? 'The learner did not explain the daylight mechanism.' : null,
  })) };
  if (fields.script) return {
    script: 'Here is what I understood from your teaching. ' + input.beliefs.map(belief => belief.statement).join(' ') + ' Did I get that right?',
    usedBeliefIds: input.beliefs.map(belief => belief.id),
    uncertainties: input.beliefs.flatMap(belief => belief.ambiguityNote ? [belief.ambiguityNote] : []),
  };
  if (fields.summary) return {
    summary: 'The teacher repaired the distance misconception. The daylight mechanism still needs an explanation.',
    recommendedNextStep: 'Explain why a tilted hemisphere receives more hours of daylight.',
  };
  if (fields.question) return { question: 'How does tilt change the sunlight?', reason: 'Offline fixture question', targetNodeIds: ['axial-tilt'] };
  throw new Error(`Unsupported fixture stage: ${Object.keys(fields).join(', ')}`);
}

export async function startFixtureProvider() {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions') {
      response.writeHead(404).end(); return;
    }
    try {
      let text = '';
      for await (const chunk of request) text += chunk;
      const body = JSON.parse(text);
      const content = answer(body);
      calls.push(Object.keys(body.response_format.json_schema.schema.properties).join(','));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ id: 'offline-fixture', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }] }));
    } catch (error) {
      response.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: { message: error.message } }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, calls, baseURL: `http://127.0.0.1:${server.address().port}/v1` };
}
