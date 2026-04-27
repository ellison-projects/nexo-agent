import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AGENT_CWD = process.env.NEXO_AGENT_CWD || process.cwd();
const USAGE_LOG = join(AGENT_CWD, 'data', 'usage.jsonl');

type Entry = {
      ts: string;
      cost_usd: number | null;
      input_tokens: number | null;
      output_tokens: number | null;
      cache_creation_input_tokens: number | null;
      cache_read_input_tokens: number | null;
      duration_ms: number | null;
      num_turns: number | null;
};

function load(): Entry[] {
      if (!existsSync(USAGE_LOG)) return [];
      return readFileSync(USAGE_LOG, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Entry);
}

function dayKey(iso: string): string {
      const d = new Date(iso);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
}

function fmt(n: number): string {
      return `$${n.toFixed(4)}`;
}

function sum(entries: Entry[]): { cost: number; turns: number; in: number; out: number; cache_read: number } {
      return entries.reduce(
            (acc, e) => ({
                  cost: acc.cost + (e.cost_usd ?? 0),
                  turns: acc.turns + 1,
                  in: acc.in + (e.input_tokens ?? 0),
                  out: acc.out + (e.output_tokens ?? 0),
                  cache_read: acc.cache_read + (e.cache_read_input_tokens ?? 0),
            }),
            { cost: 0, turns: 0, in: 0, out: 0, cache_read: 0 }
      );
}

function main() {
      const entries = load();
      if (entries.length === 0) {
            console.log('No usage data yet. Send Nexo a message and check back.');
            return;
      }

      const now = Date.now();
      const today = entries.filter((e) => dayKey(e.ts) === dayKey(new Date().toISOString()));
      const last7 = entries.filter((e) => now - new Date(e.ts).getTime() < 7 * 24 * 60 * 60 * 1000);
      const last30 = entries.filter((e) => now - new Date(e.ts).getTime() < 30 * 24 * 60 * 60 * 1000);

      const t = sum(today);
      const w = sum(last7);
      const m = sum(last30);
      const all = sum(entries);

      console.log('Nexo cost report');
      console.log('─'.repeat(60));
      console.log(`Today    ${t.turns.toString().padStart(4)} turns   ${fmt(t.cost).padStart(10)}`);
      console.log(`Last 7d  ${w.turns.toString().padStart(4)} turns   ${fmt(w.cost).padStart(10)}`);
      console.log(`Last 30d ${m.turns.toString().padStart(4)} turns   ${fmt(m.cost).padStart(10)}`);
      console.log(`All-time ${all.turns.toString().padStart(4)} turns   ${fmt(all.cost).padStart(10)}`);
      console.log('─'.repeat(60));

      const byDay = new Map<string, Entry[]>();
      for (const e of entries) {
            const k = dayKey(e.ts);
            if (!byDay.has(k)) byDay.set(k, []);
            byDay.get(k)!.push(e);
      }
      const days = [...byDay.keys()].sort().slice(-14);
      console.log('\nLast 14 days:');
      for (const d of days) {
            const s = sum(byDay.get(d)!);
            console.log(`  ${d}   ${s.turns.toString().padStart(4)} turns   ${fmt(s.cost).padStart(10)}`);
      }

      if (all.turns > 0) {
            const avg = all.cost / all.turns;
            console.log(`\nAverage per turn: ${fmt(avg)}`);
            const cacheTotal = all.in + all.cache_read;
            if (cacheTotal > 0) {
                  const hitRate = (all.cache_read / cacheTotal) * 100;
                  console.log(`Cache read rate:  ${hitRate.toFixed(1)}% of input tokens`);
            }
      }
}

main();
