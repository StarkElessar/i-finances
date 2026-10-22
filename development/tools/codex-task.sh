#!/bin/sh
# Delegate one task to the Codex CLI (ChatGPT subscription) inside a clean throw-away worktree.
#
#   codex-task.sh <review|work> <model> <effort> <git-ref> <prompt-file> [out-file]
#
#   review  read-only sandbox: findings only, nothing is written.
#   work    workspace-write sandbox in a new branch `codex/<name>`: the coordinator verifies and merges.
#
# The worktree is created from <git-ref>, so untracked secrets (the root .env) are never visible to Codex.
# Never put tokens, passwords or production data in the prompt. Results are claims, not facts: verify
# with the tests and a second reviewer before merging.
set -eu

MODE=${1:?mode: review|work}
MODEL=${2:?model, e.g. gpt-6-astra or gpt-5.6-luna}
EFFORT=${3:?effort: low|medium|high|xhigh}
REF=${4:?git ref}
PROMPT_FILE=${5:?prompt file}
OUT=${6:-/tmp/codex-$(date +%s).log}

CODEX=${CODEX:-/opt/homebrew/bin/codex}
REPO=$(git rev-parse --show-toplevel)
NAME=$(date +%Y%m%d-%H%M%S)
WORKTREE=/tmp/codex-wt-$NAME

case "$MODE" in
	review) SANDBOX=read-only; git -C "$REPO" worktree add --detach "$WORKTREE" "$REF" >/dev/null ;;
	work) SANDBOX=workspace-write; git -C "$REPO" worktree add -b "codex/$NAME" "$WORKTREE" "$REF" >/dev/null ;;
	*) echo "unknown mode: $MODE" >&2; exit 2 ;;
esac

cd "$WORKTREE"
"$CODEX" exec --skip-git-repo-check -s "$SANDBOX" --ephemeral -m "$MODEL" -c "model_reasoning_effort=$EFFORT" "$(cat "$PROMPT_FILE")" </dev/null >"$OUT" 2>&1 || true

echo "worktree: $WORKTREE"
echo "log: $OUT"
if [ "$MODE" = review ]; then
	git -C "$REPO" worktree remove --force "$WORKTREE"
fi
