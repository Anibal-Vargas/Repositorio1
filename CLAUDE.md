# Project instructions for Claude Code

## Delegating coding tasks to lower-power model subagents

For all coding tasks in this repository, do not implement the change yourself
in the main session. Instead, use your judgment to pick the least powerful
model that can reliably do the job and run the task in the matching subagent:

- **coder-haiku** (Haiku): simple, mechanical, well-defined changes — small
  bug fixes, renames, one-file tweaks, config/workflow edits, docstrings.
- **coder-sonnet** (Sonnet): standard development work — new features,
  multi-file changes, non-trivial bug fixes, refactors, tests.

Only keep a coding task in the main session (top-tier model) when it genuinely
needs it: architectural decisions, subtle debugging across the whole codebase,
or when a subagent attempt failed and the failure suggests the task is harder
than it looked. When in doubt between two tiers, start with the lower one and
escalate if the result is inadequate.

The main session remains responsible for: understanding the user's request,
writing a clear self-contained prompt for the subagent, reviewing the
subagent's diff, and committing/pushing.

## Repository notes

- Python scripts; parts of the code and comments are in Portuguese — match
  the language and style of the file being edited.
- `estacao_tuya.py` + `.github/workflows/coleta_estacao.yml` collect weather
  station data hourly into `estacao.xlsx` (automated commits). Avoid touching
  `estacao.xlsx` manually.
