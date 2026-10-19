# Contributing to Calculator Suite

Thank you for your interest in contributing to Calculator Suite!

## Development Setup

1. Fork the repository
2. Clone your fork: `git clone https://github.com/your-username/calculator-suite.git`
3. Navigate to the project: `cd calculator-suite`
4. Install dependencies: `npm install`
5. Start the development server: `npm run dev`

## Code Style

- Use TypeScript for all new code
- Follow the existing code style (enforced by ESLint and Prettier)
- Run `npm run lint` and `npm run format` before committing
- Write tests for new features

## Testing

- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`
- Ensure all tests pass before submitting a PR

## Commit Messages

- Use clear, descriptive commit messages
- Follow conventional commit format: `type(scope): description`
- Examples:
  - `feat(finance): add SIP calculator`
  - `fix(scientific): correct degree/radian conversion`
  - `docs: update README with deployment instructions`

## Pull Request Process

1. Create a branch from `main`: `git checkout -b feature/your-feature-name`
2. Make your changes and commit
3. Push to your fork: `git push origin feature/your-feature-name`
4. Open a pull request with a clear description
5. Address any review feedback
6. Ensure CI checks pass

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
