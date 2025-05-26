# Agents and Responsibilities

1. **Planning Assistant (ChatGPT)**
   *Role: High-level design, roadmap, and prompt drafting*

   **Responsibilities**
   - Brainstorm features
   - Write clear PR prompts for Codex
   - Review CI/Gist snapshots and decide next steps

2. **Codex Agent (ChatGPT Codex GitHub App)**
   *Role: Implements code changes via pull requests*

   **Responsibilities**
   - Clone the full repo, including `test/` and `.github/workflows/`
   - Read and respect existing tests and CI rules
   - Apply code diffs, add new files, and open PRs
   - Ensure `npm test` passes before submitting a PR

3. **Continuous Integration (GitHub Actions)**
   *Role: Enforces build quality*

   **Responsibilities**
   - Compile Solidity offline using the vendored compiler
   - Run `npm test` for every push and PR
   - After merges, upload a repo snapshot to the designated Gist

4. **Developer (Gal Danino)**
   *Role: Maintainer and reviewer*

   **Responsibilities**
   - Review and merge Codex PRs
   - Resolve conflicts, vendor binaries, manage secrets
   - Drive the roadmap and select next tasks
