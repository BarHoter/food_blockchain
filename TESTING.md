Overview: purpose of splitting tests

Environment Variable:

```bash
# Default: CI runs only offline tests
export RUN_LOCAL_TESTS=false

# To run internet-dependent tests locally:
export RUN_LOCAL_TESTS=true
```

Commands:

```bash
npm test          # CI-only tests
npm run test:local  # full suite, including internet tests
```

Writing Local Tests: example pattern:

```javascript
// In test/myLocalSpec.js
const RUN_LOCAL = process.env.RUN_LOCAL_TESTS === 'true';

describe("Local-only integration tests", function() {
  if (!RUN_LOCAL) this.skip();
  it("hits an external API", async function() {
    // ...
  });
});
```
