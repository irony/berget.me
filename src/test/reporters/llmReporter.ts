import fs from 'fs'
import path from 'path'
import type { Reporter } from 'vitest/reporters'
import type { Task } from 'vitest'

type GroupKey = string // e.g. 'src/services/llmDecisionService.ts:219'

type Failure = {
  message: string
  codeLine: string | null
  stack: string
  testNames: Set<string>
}

export default class LLMReporter implements Reporter {
  private failures = new Map<GroupKey, Failure>()
  private projectRoot = process.cwd()

  toRelative(file: string): string {
    return path.relative(this.projectRoot, file)
  }

  extractLocation(stack?: string): { file: string; line: number } | null {
    if (!stack) return null
    const match = stack.match(/(\/[^:]+\.tsx?):(\d+):\d+/)
    if (!match) return null
    return {
      file: match[1],
      line: parseInt(match[2], 10),
    }
  }

  readCodeLine(filepath: string, lineNumber: number): string | null {
    try {
      const absPath = path.resolve(filepath)
      const lines = fs.readFileSync(absPath, 'utf-8').split('\n')
      return lines[lineNumber - 1]?.trim() || null
    } catch {
      return null
    }
  }

  cleanMessage(message: string): string {
    const lines = message.split('\n')
    const firstErrorLine = lines.find(line => line.includes(': ERROR:')) || lines[0]
    return firstErrorLine.trim()
  }

  collectFailures(task: Task) {
    if (task.result?.state === 'fail') {
      const testName = task.name || 'unknown test'
      const errors = task.result.errors || []

      for (const err of errors) {
        const stackLine = err.stack?.split('\n').find(l => l.includes('.ts') || l.includes('.js')) || '(no stack)'
        const location = this.extractLocation(stackLine)
        if (!location) continue

        const relFile = this.toRelative(location.file)
        const key = `${relFile}:${location.line}`
        const codeLine = this.readCodeLine(location.file, location.line)
        const message = this.cleanMessage(err.message || err.toString())

        if (!this.failures.has(key)) {
          this.failures.set(key, {
            message,
            codeLine,
            stack: `${relFile}:${location.line}`,
            testNames: new Set(),
          })
        }

        this.failures.get(key)!.testNames.add(testName)
      }
    }

    if (task.tasks?.length) {
      for (const sub of task.tasks) {
        this.collectFailures(sub)
      }
    }
  }

  async onFinished(files: Task[]) {
    for (const file of files) {
      this.collectFailures(file)
    }

    const grouped = [...this.failures.entries()].slice(0, 3)

    if (grouped.length === 0) {
      console.log('\n✅ No grouped failures.')
      return
    }

    for (const [location, { message, codeLine, stack, testNames }] of grouped) {
      console.log(`\n❌ ${location}`)
      console.log(`• ${message}`)
      if (codeLine) console.log(`  → ${codeLine}`)
      console.log(`  ↳ ${stack}`)
      if (testNames.size > 0) {
        console.log(`  ✴ used in: ${[...testNames].join(', ')}`)
      }
    }

    if (this.failures.size > 3) {
      console.log(`\n...${this.failures.size - 3} more failure locations not shown.`)
    }
  }
}
