# Local Proposal Workflow

This note is intentionally kept outside the published docs site.

NixPI can prepare local changes for human review without publishing them autonomously.

## Expected flow

1. Ask NixPI to inspect the repo and prepare a local change.
2. Let it edit files and run local validation.
3. Review the diff locally.
4. Decide whether to keep, revise, commit, or discard the change.
5. Use normal git/GitHub workflows outside NixPI for publishing.

## Constraints

- local working clone is expected at `/srv/nixpi`
- NixPI should not push, open PRs, merge, or trigger rollout by itself
