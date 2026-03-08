/**
 * Agent Loop — Self-Evaluating Generation
 *
 * Generate → evaluate (using existing validators) → iterate until quality threshold.
 * Uses existing validators as exit conditions:
 *   - calculateQuickATSScore() → keyword match score
 *   - validateAllBullets() → bullet quality scoring
 *   - scanRedFlags() → red flag detection
 *   - validateATSFormat() → format compliance
 *   - analyzeClaim() → defensibility scoring
 *
 * Max iterations: 3 (cost-conscious — each iteration costs API tokens)
 */

export interface AgentStep<T> {
  /** Generate a result (calls AI) */
  generate: (feedback?: string) => Promise<T>;

  /** Evaluate the result using existing validators */
  evaluate: (result: T) => Promise<AgentEvaluation>;

  /** Minimum score to accept the result (0-100) */
  threshold: number;

  /** Maximum iterations before accepting best result */
  maxIterations: number;
}

export interface AgentEvaluation {
  /** Overall score (0-100) */
  score: number;

  /** Human-readable feedback for the next iteration */
  feedback: string;

  /** Specific issues found */
  issues: string[];
}

export interface AgentLoopResult<T> {
  /** The best result produced */
  result: T;

  /** Score of the best result */
  score: number;

  /** Number of iterations performed */
  iterations: number;

  /** Whether the threshold was met */
  metThreshold: boolean;

  /** Feedback from each iteration */
  history: Array<{ score: number; feedback: string }>;
}

/**
 * Run an agent loop: generate → evaluate → iterate until good enough.
 *
 * @example
 * ```ts
 * const result = await agentLoop({
 *   generate: async (feedback) => {
 *     return aiService.chat([
 *       { role: 'system', content: systemPrompt },
 *       { role: 'user', content: feedback ? `${prompt}\n\nPrevious feedback: ${feedback}` : prompt },
 *     ], { temperature: 0.5 });
 *   },
 *   evaluate: async (response) => {
 *     const atsScore = calculateQuickATSScore(profile, jd);
 *     const bulletReport = validateAllBullets(roles);
 *     const redFlags = scanRedFlags(profile);
 *     const combinedScore = (atsScore.score * 0.4 + bulletReport.overallScore * 0.4 + redFlags.score * 0.2);
 *     return {
 *       score: combinedScore,
 *       feedback: `ATS: ${atsScore.score}, Bullets: ${bulletReport.overallScore}, RedFlags: ${redFlags.score}`,
 *       issues: bulletReport.topIssues.map(i => i.message),
 *     };
 *   },
 *   threshold: 80,
 *   maxIterations: 3,
 * });
 * ```
 */
export async function agentLoop<T>(step: AgentStep<T>): Promise<AgentLoopResult<T>> {
  let bestResult: T | null = null;
  let bestScore = 0;
  let lastFeedback: string | undefined;
  const history: Array<{ score: number; feedback: string }> = [];

  for (let i = 0; i < step.maxIterations; i++) {
    try {
      const result = await step.generate(lastFeedback);
      const evaluation = await step.evaluate(result);

      history.push({
        score: evaluation.score,
        feedback: evaluation.feedback,
      });

      if (evaluation.score > bestScore) {
        bestResult = result;
        bestScore = evaluation.score;
      }

      if (evaluation.score >= step.threshold) {
        console.log(
          `[AgentLoop] Threshold met at iteration ${i + 1}: ${evaluation.score}/${step.threshold}`
        );
        return {
          result: bestResult!,
          score: bestScore,
          iterations: i + 1,
          metThreshold: true,
          history,
        };
      }

      // Build feedback for next iteration
      lastFeedback = buildIterationFeedback(evaluation);
      console.log(
        `[AgentLoop] Iteration ${i + 1}: score ${evaluation.score}/${step.threshold}, iterating...`
      );
    } catch (error) {
      console.error(`[AgentLoop] Iteration ${i + 1} failed:`, error);
      // If we have a previous best result, break and return it
      if (bestResult !== null) break;
      throw error;
    }
  }

  console.log(`[AgentLoop] Max iterations reached. Best score: ${bestScore}/${step.threshold}`);

  return {
    result: bestResult!,
    score: bestScore,
    iterations: history.length,
    metThreshold: false,
    history,
  };
}

function buildIterationFeedback(evaluation: AgentEvaluation): string {
  const parts = [`Previous score: ${evaluation.score}/100.`];

  if (evaluation.issues.length > 0) {
    parts.push(`Issues to fix: ${evaluation.issues.slice(0, 5).join('; ')}`);
  }

  if (evaluation.feedback) {
    parts.push(evaluation.feedback);
  }

  return parts.join(' ');
}
