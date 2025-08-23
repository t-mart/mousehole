# Contributing to Mousehole

Thank you for your interest in contributing to Mousehole! This document provides guidelines and information about contributing.

## Types of Contributions

### Community Integrations
- Dashboard integrations (Homepage, Grafana, etc.)
- Container orchestration configs (Docker Compose, K8s)
- Monitoring solutions (Prometheus, etc.)

### Core Development
- Bug fixes
- Feature additions
- Documentation improvements
- Test coverage

## Adding a New Integration

1. Create a new directory in `contrib/` with a descriptive name
2. Include a README.md that explains:
   - What the integration does
   - Requirements
   - Installation steps
   - Configuration details
   - Screenshots/examples
3. Add any necessary configuration files
4. Update the main contrib README.md to list your integration

### Integration Structure Example
```
contrib/
└── your-integration/
    ├── README.md
    ├── config.yaml
    ├── docs/
    │   └── screenshots.png
    └── other-files...
```

## Development Guidelines

### Code Style
- Follow existing code formatting
- Use meaningful variable/function names
- Add comments for complex logic
- Include TypeScript types where applicable

### Testing
- Add tests for new features
- Ensure existing tests pass
- Run `bun test` before submitting

### Documentation
- Update README.md for feature changes
- Document new configuration options
- Include examples where helpful

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test your changes
5. Submit a Pull Request with:
   - Clear description of changes
   - Screenshots for UI changes
   - Related issue numbers

## Getting Help

- Open an [issue](https://github.com/t-mart/mousehole/issues) for bugs
- Start a [discussion](https://github.com/t-mart/mousehole/discussions) for questions
- Check existing issues/discussions before posting