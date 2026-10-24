# metah

metah is a GUI harness that takes one idea through a grilling interview, a written Spec, a graph of Tickets, and agent execution — the Matt Pocock skill chain, productized.

## Language

### Pipeline

**WorkOrder**:
The harness-level container that takes one idea through Grilling, a Spec, a Ticket Graph, and execution. Creating one is the "new session" action.
_Avoid_: project, initiative, session

**Grilling**:
A relentless interview that stress-tests an idea until it can be written down as a Spec.
_Avoid_: interview, requirements gathering

**Spec**:
The settled written agreement of what will be built and why. The parent of every Ticket in a WorkOrder.
_Avoid_: plan, PRD, design doc

### Tickets

**Ticket**:
A tracer-bullet vertical slice of a Spec that declares which other Tickets block it.
_Avoid_: task, issue, step

**Ticket Graph**:
The set of a Spec's Tickets and their blocking edges. Work is never "a list of steps"; it is this graph.
_Avoid_: backlog, ticket list

**Frontier**:
The Tickets whose blockers are all complete — the ones ready to Run right now.
_Avoid_: ready queue

**Run**:
The execution of a single Ticket by an agent, in its own Session and worktree.
_Avoid_: implementation, job

**Autopilot**:
A per-WorkOrder setting that lets Runs start without per-Ticket approval.
_Avoid_: auto-merge, yolo mode

**Tracker**:
The configured store where a repo's Tickets are published and resolved. Local files by default.
_Avoid_: issue tracker, backlog

### Agents and Git

**Session**:
One conversation with an agent. A WorkOrder contains many Sessions; never use "session" for the WorkOrder itself.
_Avoid_: chat, thread

**Integration Branch**:
The branch inside a WorkOrder's worktree that completed Runs merge into.
_Avoid_: main, master
