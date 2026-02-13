// OWNED BY T09 — do not edit outside that task
import Link from "next/link";

export default function Home() {
  return (
    <main className="landing-shell">
      <div className="landing-card">
        <span className="eyebrow">Teach by explaining</span>
        <h1>Curio</h1>
        <p>A calm space to test understanding, uncover gaps, and make ideas stick.</p>
        <Link className="primary-link" href="/setup">Set up a session</Link>
      </div>
    </main>
  );
}
