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

**Stage**:
Where a WorkOrder stands in the pipeline: Grilling, Spec, Tickets, Running, Review, or Done.
_Avoid_: phase, column, status

**Gate**:
The user's confirmation that admits a WorkOrder to its next Stage. The only way a Stage advances.
_Avoid_: approval step, checkpoint

**Brief**:
The metah-written opening message of a Session: its Stage's skills plus the full text of everything it needs, such as a Run's Ticket and the Spec.
_Avoid_: prompt, instructions

**Planning Session**:
The single Session in which a WorkOrder's Grilling, Spec, and Ticket Graph are produced, in one unbroken context.
_Avoid_: grill session, spec session

**Parked**:
The state of a WorkOrder whose Grilling is suspended on a question that only a prototype can answer.
_Avoid_: blocked, paused

**Review**:
The stage after a Ticket Graph completes, in which the Integration Branch is checked against the Spec and the repo's coding standards, ending in the user's acceptance.
_Avoid_: QA, code review stage

**Fix Run**:
The single Run that addresses a Review's findings.
_Avoid_: patch run, follow-up

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
The store where a WorkOrder's Spec, Tickets, and Review findings are published and resolved. Owned by metah, never committed to the target repo.
_Avoid_: issue tracker, backlog

### Agents and Git

**Session**:
One conversation with an agent. A WorkOrder contains many Sessions; never use "session" for the WorkOrder itself.
_Avoid_: chat, thread

**Skill Pack**:
The pinned set of skills metah supplies to every Session, from outside the target repo.
_Avoid_: plugins, prompts

**Integration Branch**:
The branch inside a WorkOrder's worktree that completed Runs merge into.
_Avoid_: main, master
