# NPM Package Publishing Strategy

> A comprehensive guide for publishing and maintaining the jira-mcp npm package.

## Table of Contents

1. [Package Structure](#package-structure)
2. [NPM Page Optimisation](#npm-page-optimisation)
3. [Publishing Checklist](#publishing-checklist)
4. [Versioning Strategy](#versioning-strategy)
5. [Release Workflow](#release-workflow)
6. [Best Practices Implemented](#best-practices-implemented)

---

## Package Structure

### Published Files

The following files are included in the npm package:

```
jira-mcp/
├── dist/                    # Compiled JavaScript (ES Modules)
│   └── index.js            # Main entry point
├── package.json            # Package metadata
├── README.md               # Package documentation (displayed on npm)
├── CHANGELOG.md            # Version history
├── LICENSE                 # MIT License
└── SECURITY.md             # Security policy
```

### Excluded Files (via .npmignore)

```
src/                        # TypeScript source files
*.ts                        # TypeScript files
tsconfig.json              # TypeScript configuration
.vscode/                   # Editor configuration
.idea/                     # JetBrains configuration
.env*                      # Environment files
mcp.json                   # MCP configuration
node_modules/              # Dependencies
.git/                      # Git repository
*.log                      # Log files
FEATURE_ROADMAP.md         # Internal documentation
IMPLEMENTATION_PLAN.md     # Internal documentation
CONTRIBUTING.md            # Keep for GitHub, exclude from npm
docs/                      # Documentation folder (for GitHub)
```

---

## NPM Page Optimisation

### package.json Best Practices

Our `package.json` implements the following npm best practices:

#### Required Fields
- ✅ `name`: Unique, URL-safe package name
- ✅ `version`: Semantic versioning (x.y.z)
- ✅ `description`: Concise, searchable description
- ✅ `main`: Entry point for CommonJS
- ✅ `type`: Module type (ES Modules)

#### Discovery & SEO
- ✅ `keywords`: Relevant search terms for npm discovery
- ✅ `repository`: GitHub link for source code access
- ✅ `homepage`: Project landing page
- ✅ `bugs`: Issue tracker URL

#### Trust & Professionalism
- ✅ `license`: SPDX identifier (MIT)
- ✅ `author`: Full author information
- ✅ `contributors`: Recognition for contributors
- ✅ `funding`: Support the project link

#### Technical Metadata
- ✅ `engines`: Node.js version requirements
- ✅ `bin`: CLI executable
- ✅ `files`: Explicit file inclusion
- ✅ `exports`: Modern ES modules support
- ✅ `types`: TypeScript declarations path

### README.md Best Practices

Our README follows these guidelines for maximum npm page impact:

1. **Clear Title & Badges**: Project name with status badges
2. **Compelling Description**: One-liner explaining value proposition
3. **Visual Hierarchy**: Clear sections with emojis and formatting
4. **Quick Start**: Installation in under 2 minutes
5. **Feature List**: Scannable bullet points
6. **Configuration Examples**: Copy-paste ready code blocks
7. **API Reference**: Complete tool documentation
8. **Troubleshooting**: Common issues and solutions
9. **Links**: GitHub, documentation, related projects

---

## Publishing Checklist

### Pre-Publish

- [ ] Update version in `package.json`
- [ ] Update `CHANGELOG.md` with changes
- [ ] Run `npm run build` successfully
- [ ] Run `npm run lint` (if available)
- [ ] Run `npm run test` (if available)
- [ ] Run `npm pack` and verify contents
- [ ] Test local installation: `npm install ./jira-mcp-x.y.z.tgz`
- [ ] Verify README renders correctly on GitHub
- [ ] Check all links are working

### Publish

```bash
# Dry run to see what would be published
npm publish --dry-run

# Publish to npm (ensure you're logged in)
npm publish

# For scoped packages (@scope/name):
npm publish --access public
```

### Post-Publish

- [ ] Verify package on npmjs.com
- [ ] Create GitHub release with changelog
- [ ] Update documentation if needed
- [ ] Announce release (if applicable)

---

## Versioning Strategy

We follow [Semantic Versioning 2.0.0](https://semver.org/):

### Version Format: `MAJOR.MINOR.PATCH`

| Change Type | Version Bump | Example |
|------------|--------------|---------|
| Breaking API changes | MAJOR | 1.0.0 → 2.0.0 |
| New features (backwards-compatible) | MINOR | 1.0.0 → 1.1.0 |
| Bug fixes (backwards-compatible) | PATCH | 1.0.0 → 1.0.1 |

### Pre-release Versions

```
1.0.0-alpha.1    # Alpha release
1.0.0-beta.1     # Beta release
1.0.0-rc.1       # Release candidate
```

### Version Bump Commands

```bash
# Patch release (1.0.0 → 1.0.1)
npm version patch

# Minor release (1.0.0 → 1.1.0)
npm version minor

# Major release (1.0.0 → 2.0.0)
npm version major

# Pre-release
npm version prerelease --preid=beta
```

---

## Release Workflow

### Automated Release (Recommended)

1. **Prepare Changes**
   ```bash
   git checkout -b release/v1.1.0
   ```

2. **Update Changelog**
   - Document all changes since last release
   - Follow [Keep a Changelog](https://keepachangelog.com/) format

3. **Bump Version**
   ```bash
   npm version minor -m "Release v%s"
   ```

4. **Build & Verify**
   ```bash
   npm run build
   npm pack
   npm publish --dry-run
   ```

5. **Publish**
   ```bash
   npm publish
   git push origin release/v1.1.0 --tags
   ```

6. **Create GitHub Release**
   - Tag: `v1.1.0`
   - Title: `Release v1.1.0`
   - Body: Copy from CHANGELOG.md

### Manual Release

For quick patches:

```bash
# Make changes
git add .
git commit -m "fix: resolve authentication issue"

# Bump and publish
npm version patch
npm run build
npm publish
git push --tags
```

---

## Best Practices Implemented

### 1. Package Quality

| Practice | Status | Notes |
|----------|--------|-------|
| TypeScript | ✅ | Full type safety |
| ES Modules | ✅ | Modern `"type": "module"` |
| Node.js 18+ | ✅ | LTS support |
| MIT License | ✅ | Permissive open source |
| Semantic Versioning | ✅ | Predictable updates |

### 2. Documentation

| Document | Purpose |
|----------|---------|
| README.md | npm page content, quick start |
| CHANGELOG.md | Version history |
| CONTRIBUTING.md | Contribution guidelines |
| SECURITY.md | Security policy |
| LICENSE | Legal terms |

### 3. NPM Metadata

| Field | Value | Purpose |
|-------|-------|---------|
| `keywords` | 9 relevant terms | Search discovery |
| `repository` | GitHub URL | Source access |
| `bugs` | Issues URL | Bug reporting |
| `homepage` | README link | Project info |
| `funding` | Ko-fi/GitHub | Support |
| `engines` | `>=18.0.0` | Compatibility |

### 4. Security

- `.npmignore` excludes sensitive files
- `SECURITY.md` provides disclosure policy
- No credentials in published package
- `prepublishOnly` ensures fresh builds

---

## Maintaining Package Health

### Regular Maintenance

- **Weekly**: Check for dependency vulnerabilities (`npm audit`)
- **Monthly**: Update dependencies (`npm update`)
- **Quarterly**: Review and update documentation
- **Yearly**: Consider major version upgrade

### Monitoring

- [npm download stats](https://www.npmjs.com/package/jira-mcp)
- [Snyk vulnerability reports](https://snyk.io/advisor/npm-package/jira-mcp)
- [Bundlephobia size analysis](https://bundlephobia.com/package/jira-mcp)
- GitHub issues and discussions

---

## Related Links

- [npm documentation](https://docs.npmjs.com/)
- [Semantic Versioning](https://semver.org/)
- [Keep a Changelog](https://keepachangelog.com/)
- [npm best practices](https://blog.npmjs.org/post/165769683050/publishing-what-you-mean-to-publish)
