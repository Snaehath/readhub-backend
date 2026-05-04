const EventEmitter = require('events');

class AgentEventPipeline extends EventEmitter {
  constructor(res) {
    super();
    this.res = res;
  }

  emitEvent(type, message, data = {}) {
    const event = {
      type,
      message,
      timestamp: new Date().toISOString(),
      ...data
    };
    
    // Format for Server-Sent Events
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  status(message) {
    this.emitEvent('status', message);
  }

  toolCall(toolName, args) {
    this.emitEvent('tool_call', `Invoking ${toolName}`, { tool: toolName, args });
  }

  toolResult(toolName, resultSummary) {
    this.emitEvent('tool_result', `Retrieved data from ${toolName}`, { tool: toolName, result: resultSummary });
  }

  llmStep(message) {
    this.emitEvent('llm_step', message);
  }

  final(reply, thoughts, latency) {
    this.emitEvent('final', 'Response ready', { reply, thoughts, latency });
  }
}

module.exports = AgentEventPipeline;
