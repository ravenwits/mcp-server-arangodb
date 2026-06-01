# Contributing

Thanks for helping improve MCP Server for ArangoDB.

## Development Workflow

1. Create a feature branch from `main`.
2. Keep the branch focused on one fix or feature.
3. Run tests before opening a pull request.
4. Open a pull request into `main`.
5. Wait for CI and maintainer review before merge.

```bash
git checkout main
git pull origin main
git checkout -b feature/short-description
npm ci
npm test
```

## Pull Requests

- Describe the user-visible change and why it is needed.
- Include tests when behavior changes.
- Keep generated build output out of commits.
- Do not bump the package version unless the maintainer asks for it.
- Do not create release tags from contribution branches.

## Releases

Only the repository owner publishes npm packages and creates GitHub Releases. The release workflow rejects release attempts from any other actor.
