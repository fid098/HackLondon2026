/**
 * Vitest global test setup.
 *
 * Runs once before all test files.
 * Imports @testing-library/jest-dom to extend Vitest's expect()
 * with DOM matchers like .toBeInTheDocument(), .toHaveTextContent(), etc.
 */

import '@testing-library/jest-dom'
