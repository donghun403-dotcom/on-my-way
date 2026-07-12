# Repository workflow

- After completing user-requested code or design changes and running the relevant checks, automatically stage only the files that belong to the current request, create a concise commit, and push the current branch to `origin`.
- If the branch already has a pull request, update that pull request. Otherwise, open a draft pull request against the repository's default branch.
- Never include unrelated working-tree changes, generated local data, credentials, secrets, or environment files in a commit.
- If validation fails, fix the failure before publishing when it is within scope. Report genuine blockers instead of pushing a knowingly broken change.
- An explicit user instruction not to commit, push, or open a pull request overrides this default workflow.
