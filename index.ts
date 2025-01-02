/// <reference types="bun-types" />

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { stdin } from 'node:process';
import { createInterface } from 'node:readline';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface Tool {
  name: string;
  description: string;
  implementation: string;
}

interface ToolResult {
  success: boolean;
  result: any;
  error?: string;
}

class AIAgent {
  private history: Message[] = [];
  private tools: Tool[] = [];
  private readonly historyFile = 'history.json';
  private debug: boolean = false;  // Debug mode enabled by default

  private log(...args: any[]) {
    if (this.debug) {
      console.log('\n[DEBUG]', ...args, '\n');
    }
  }

  constructor() {
    this.log('Initializing AI Agent...');
    this.loadHistory();
    this.initializeBasicTools();
    this.log('Available tools:', this.tools.map(t => t.name));
  }

  private getSystemPrompt(): string {
    const toolDescriptions = this.tools
      .map(tool => `${tool.name}: ${tool.description}`)
      .join('\n');

    return `You are an AI agent capable of using and generating tools/functions.

Available tools:
${toolDescriptions}

IMPORTANT: You must ALWAYS respond with a valid JSON object in the following format:
{
  "reasoning": "string explaining your thought process",
  "actions": [
    {
      "tool": "string (name of the tool to use)",
      "args": ["arg1", "arg2"]
    }
  ],
  "newTools": [
    {
      "name": "string",
      "description": "string",
      "implementation": "function foo() { return 'bar'; }\n return foo();"
    }
  ],
  "response": "string (your response to the user)"
}

Rules:
1. Your response MUST be a valid JSON object
2. All property names must be in quotes
3. All string values must be in quotes
4. Arrays can be empty but must be present
5. Do not include any text before or after the JSON object

When generating new tools:
1. Each tool should be focused and do one thing well
2. Include proper error handling
3. Tool implementations should be valid JavaScript code and must return a value (not just a function call)
4. Tool implementations MUST ALWAYS end in a return statement
5. No, really, make sure you always return a value - the last line of MUST always be a return statement
6. Always use modern ESNext syntax
7. Never use imports or external libraries
8. When using a free API, always actually use the API - don't simulate one`;
  }

  private loadHistory(): void {
    try {
      const data = readFileSync(this.historyFile, 'utf-8');
      this.history = JSON.parse(data);
    } catch (error) {
      console.log('No history file found, starting fresh');
      this.history = [];
    }
  }

  private saveHistory(): void {
    writeFileSync(this.historyFile, JSON.stringify(this.history, null, 2));
  }

  private initializeBasicTools(): void {
    this.tools = [
{
  "name": "readMainFile",
  "description": "Reads the contents of the main index.ts file",
  "implementation": "\n          const content = readFileSync('index.ts', 'utf-8');\n          return content;\n        "
},
{
  "name": "writeMainFile",
  "description": "Writes content to the main index.ts file",
  "implementation": "\n          writeFileSync('index.ts', arg0);\n          return 'File written successfully';\n        "
},
{
  "name": "listFiles",
  "description": "Lists all files in the current working directory",
  "implementation": "\n          const files = readdirSync('.');\n          return files;\n        "
}
];
  }

  private async executeTool(name: string, args: any[]): Promise<ToolResult> {
    this.log(`Executing tool: ${name} with args:`, args);
    const tool = this.tools.find(t => t.name === name);
    if (!tool) {
      this.log(`Tool '${name}' not found!`);
      return {
        success: false,
        result: null,
        error: `Tool '${name}' not found`
      };
    }

    try {
      this.log('Tool implementation:', tool.implementation);
      // Create a function from the implementation string and immediately execute it
      const fn = new Function(...args.map((_, i) => `arg${i}`), `
        try {
          ${tool.implementation}
        } catch (error) {
          throw new Error(\`Tool execution failed: \${error.message}\`);
        }
      `);
      const result = await fn(...args);
      this.log('Tool execution result:', result);
      return {
        success: true,
        result
      };
    } catch (error) {
      this.log('Tool execution error:', error);
      return {
        success: false,
        result: null,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // Initialize OpenAI client
  private openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  private async generateResponse(input: string, toolResults?: Record<string, ToolResult>): Promise<any> {
    this.log('Generating response for input:', input);
    if (toolResults) {
      this.log('With tool results:', toolResults);
    }

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...this.history.map(msg => ({ role: msg.role, content: msg.content })),
      { role: 'user', content: input }
    ];

    if (toolResults) {
      messages.push({
        role: 'system',
        content: `Tool execution results:\n${JSON.stringify(toolResults, null, 2)}\n\nRemember to respond with a valid JSON object as specified in the format above.`
      });
    }

    let completion;
    try {
      completion = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const content = completion.choices[0].message.content || '{}';
      const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      this.log('Parsed response:', parsed);
      return parsed;
    } catch (error) {
      this.log('Error in OpenAI request or parsing:', error);
      console.error('Failed to parse AI response:', error);
      console.error('Raw response:', completion?.choices[0]?.message?.content);
      return {
        reasoning: 'Failed to generate proper response',
        actions: [],
        newTools: [],
        response: 'Error: Failed to process the request. Please try again.'
      };
    }
  }

  private updateTools(newTools: Tool[]): void {
    this.tools.push(...newTools);
    
    // Update the main file with new tools
    const currentFile = readFileSync('index.ts', 'utf-8');
    const toolsSection = this.tools.map(tool => JSON.stringify(tool, null, 2)).join(',\n');
    const updatedFile = currentFile.replace(
      /this\.tools = \[([\s\S]*?)\];/,
      `this.tools = [\n${toolsSection}\n];`
    );
    
    writeFileSync('index.ts', updatedFile);
  }

  public async processUserInput(input: string): Promise<string> {
    this.log('Processing user input:', input);
    this.history.push({ role: 'user', content: input });
    
    let aiResponse = await this.generateResponse(input);
    this.log('AI response:', aiResponse);
    
    if (aiResponse.actions && aiResponse.actions.length > 0) {
      this.log('Executing actions:', aiResponse.actions);
      const toolResults: Record<string, ToolResult> = {};
      
      for (const action of aiResponse.actions) {
        toolResults[action.tool] = await this.executeTool(action.tool, action.args || []);
      }
      
      this.log('Tool execution results:', toolResults);
      aiResponse = await this.generateResponse(input, toolResults);
      this.log('Updated AI response with tool results:', aiResponse);
    }
    
    if (aiResponse.newTools && aiResponse.newTools.length > 0) {
      this.log('Adding new tools:', aiResponse.newTools);
      this.updateTools(aiResponse.newTools);
      await this.restart();
    }

    const response = aiResponse.response;
    this.history.push({ role: 'assistant', content: response });
    this.saveHistory();
    
    return response;
  }

  public async restart(): Promise<void> {
    this.saveHistory();
    process.exit(0); // Bun will restart the process due to --watch flag
  }
}

// Create and export the agent instance
export const agent = new AIAgent();

// If this is the main module, start the interaction loop
if (import.meta.main) {
  console.log('AI Agent started.');
  
  // Check if the last message was from the user and process it
  const lastMessage = agent['history'][agent['history'].length - 1];
  if (lastMessage && lastMessage.role === 'user') {
    console.log('Continuing previous conversation...');
    console.log('Last user message:', lastMessage.content);
    agent.processUserInput(lastMessage.content).then(response => {
      console.log('AI:', response);
    });
  }

  const rl = createInterface({
    input: stdin,
    output: process.stdout
  });

  rl.on('line', async (input: string) => {
    const response = await agent.processUserInput(input);
    console.log('AI:', response);
  });
} 