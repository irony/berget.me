import type { Reporter, TaskResultPack } from 'vitest/reporters'
import { File, Task } from 'vitest'

export default class LLMReporter implements Reporter {
  private failures: TaskResultPack[] = []

  async onTaskUpdate(packs: TaskResultPack[]) {
    for (const pack of packs) {
      const [, result] = pack
      if (result?.state === 'fail') {
        this.failures.push(pack)
      }
    }
  }

  async onFinished() {
    const limited = this.failures.slice(0, 3)

    for (const [taskId, result] of limited) {
      const task = result as Task
      const file = (task as File).filepath || 'unknown file'
      const testName = task.name || 'unknown test'

      console.log(`\nFAIL: ${file}`)
      console.log(`↳ ${testName}`)

      const errors = task.result?.errors || []
      for (const err of errors) {
        const msg = err.message?.split('\n')[0] || 'Unknown error'
        const stackLine = err.stack?.split('\n').find(l => l.includes('.ts') || l.includes('.js')) || '(no stack)'
        console.log(`• ${msg}`)
        console.log(`  ↳ ${stackLine.trim()}`)
      }
    }

    if (this.failures.length > 3) {
      console.log(`\n...${this.failures.length - 3} more failures not shown.`)
    }
  }
}
