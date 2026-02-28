export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
    'type-enum': [
      2,
      'always',
      [
        'feat',     // New feature
        'fix',      // Bug fix
        'docs',     // Documentation
        'style',    // Formatting, missing semi colons, etc.
        'refactor', // Code restructuring without behavior change
        'perf',     // Performance improvement
        'test',     // Adding tests
        'build',    // Build system or external dependencies
        'ci',       // CI configuration
        'chore',    // Maintenance tasks
        'revert',   // Revert previous commit
      ],
    ],
    'subject-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 200],
  },
};
