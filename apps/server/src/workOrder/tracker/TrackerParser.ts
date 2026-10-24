import { REVIEW_PATH, SPEC_PATH, TICKETS_DIR } from "./TrackerLayout.ts";

export type ParseResult<A> = { ok: true; value: A } | { ok: false; errors: ReadonlyArray<string> };

export interface ParsedSpec {
  title: string;
  text: string;
}

export interface ParsedTicket {
  number: number;
  slug: string;
  title: string;
  body: string;
  blockedBy: ReadonlyArray<number>;
}

export interface ParsedReview {
  text: string;
  findings: ReadonlyArray<{ axis: "standards" | "spec"; text: string }>;
}

const ok = <A>(value: A): ParseResult<A> => ({ ok: true, value });
const err = <A>(...errors: string[]): ParseResult<A> => ({ ok: false, errors });

// "# 01: Title" or "# 01: Title" with a non-capturing NN group.
const TICKET_HEADING = /^#\s*(\d+):\s*(.+)$/m;
// "**Blocked by:** 1, #03: Setup" or "Blocked by: None (can start immediately)".
const BLOCKED_BY = /^\s*(?:\*\*)?Blocked by:?(?:\*\*)?:?\s*(.+)$/im;

const parseBlockedBy = (line: string): number[] => {
  const value = BLOCKED_BY.exec(line)?.[1]?.trim() ?? "";
  if (value === "" || /^none\b/i.test(value)) return [];
  return [...value.matchAll(/#?(\d+)/g)].map((m) => Number(m[1]));
};

export const parseSpec = (content: string | undefined): ParseResult<ParsedSpec> => {
  if (content === undefined) {
    return err(`Spec file ${SPEC_PATH} is missing.`);
  }
  const heading = /^#\s+(.+)$/m.exec(content);
  if (!heading) {
    return err(`${SPEC_PATH} must start with a \`# <title>\` heading; none found.`);
  }
  const title = heading[1].trim();
  const body = content.slice((heading.index ?? 0) + heading[0].length).trim();
  if (title === "" || body === "") {
    return err(
      `${SPEC_PATH} has an empty title or body; write the spec under the \`# <title>\` heading.`,
    );
  }
  return ok({ title, text: content.trim() });
};

export const parseTicketGraph = (
  files: ReadonlyArray<{ fileName: string; content: string }>,
): ParseResult<ReadonlyArray<ParsedTicket>> => {
  if (files.length === 0) {
    return err(`No ticket files found in ${TICKETS_DIR}/; break the spec into tickets first.`);
  }

  const errors: string[] = [];
  const tickets: ParsedTicket[] = [];
  const byNumber = new Map<number, { fileName: string; slug: string }>();

  for (const { fileName, content } of files) {
    const fileNumber = /^(\d+)-/.exec(fileName)?.[1];
    const heading = TICKET_HEADING.exec(content);
    if (!fileNumber || !heading) {
      errors.push(
        `${TICKETS_DIR}/${fileName}: expected \`# <NN>: <title>\` as the ticket heading; ${heading ? "the filename" : "no such heading was"} not found.`,
      );
      continue;
    }
    const number = Number(heading[1]);
    const title = heading[2].trim();
    const slug = fileName.replace(/^\d+-/, "").replace(/\.md$/, "");
    if (String(number).padStart(2, "0") !== String(Number(fileNumber)).padStart(2, "0")) {
      errors.push(
        `${TICKETS_DIR}/${fileName}: heading says ticket ${number} but the filename number is ${Number(fileNumber)}; they must match.`,
      );
      continue;
    }
    const dup = byNumber.get(number);
    if (dup) {
      errors.push(
        `Duplicate ticket number ${number}: ${TICKETS_DIR}/${dup.fileName} and ${TICKETS_DIR}/${fileName}.`,
      );
      continue;
    }
    byNumber.set(number, { fileName, slug });
    tickets.push({ number, slug, title, body: content.trim(), blockedBy: parseBlockedBy(content) });
  }

  for (const ticket of tickets) {
    for (const blocker of ticket.blockedBy) {
      if (!byNumber.has(blocker)) {
        errors.push(
          `${TICKETS_DIR}/${ticket.slug ? `${String(ticket.number).padStart(2, "0")}-${ticket.slug}.md` : `ticket ${ticket.number}`}: blocked by ticket ${String(blocker).padStart(2, "0")}, which does not exist.`,
        );
      }
    }
  }

  if (errors.length === 0 && tickets.length > 0) {
    // Detect cycles; report each cycle once as a path like "01 → 03 → 01".
    const state = new Map<number, 0 | 1 | 2>(); // 0 = unvisited, 1 = in stack, 2 = done
    const stack: number[] = [];
    const cycles: string[] = [];
    const visit = (n: number): void => {
      state.set(n, 1);
      stack.push(n);
      for (const b of byNumber.get(n) ? tickets.find((t) => t.number === n)!.blockedBy : []) {
        const s = state.get(b) ?? 0;
        if (s === 1) {
          const start = stack.indexOf(b);
          cycles.push(
            [...stack.slice(start), b].map((x) => String(x).padStart(2, "0")).join(" → "),
          );
        } else if (s === 0) {
          visit(b);
        }
      }
      stack.pop();
      state.set(n, 2);
    };
    for (const t of tickets) {
      if ((state.get(t.number) ?? 0) === 0) visit(t.number);
    }
    for (const cycle of cycles) {
      errors.push(`Ticket dependency cycle: ${cycle}.`);
    }
  }

  if (errors.length > 0) return err(...errors);
  if (tickets.length === 0) {
    return err(`No parseable ticket files found in ${TICKETS_DIR}/.`);
  }
  return ok([...tickets].sort((a, b) => a.number - b.number));
};

const listItems = (section: string): string[] =>
  [...section.matchAll(/^\s*(?:[-*+]\s+)(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((text) => text !== "" && !/^none\b/i.test(text));

export const parseReviewFindings = (content: string | undefined): ParseResult<ParsedReview> => {
  if (content === undefined) {
    return err(`Review file ${REVIEW_PATH} is missing.`);
  }
  const standardsAt = content.search(/^\s*#{2,3}\s*Standards\s*$/im);
  const specAt = content.search(/^\s*#{2,3}\s*Spec\s*$/im);
  if (standardsAt === -1 || specAt === -1) {
    return err(
      `${REVIEW_PATH} must contain \`## Standards\` and \`## Spec\` sections; ${standardsAt === -1 ? "`## Standards`" : "`## Spec`"} is missing.`,
    );
  }
  const sections: Array<{ axis: "standards" | "spec"; at: number }> = [
    { axis: "standards", at: standardsAt },
    { axis: "spec", at: specAt },
  ].sort((a, b) => a.at - b.at);
  const findings = sections.flatMap((section, i) => {
    const end = i + 1 < sections.length ? sections[i + 1].at : content.length;
    return listItems(content.slice(section.at, end)).map((text) => ({ axis: section.axis, text }));
  });
  return ok({ text: content.trim(), findings });
};
