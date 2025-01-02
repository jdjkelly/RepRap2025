# RepRap2025

RepRap2025 is an agent that can build itself.

Specifically, it is capable of generating its own tools / functions to use.

## How it works

It starts with a main function that exposes a prompt describing that it will generate tools / functions to use given a starting user input.

It then generates a tool / function that is capable of generating a response to the user input. 

After that, it reloads its own process. Immediately prior to reloading, it stores the message history in a file and reads this on restart to continue.

It then uses the tool / function to generate a response to the user input.

It has two tools available to begin with:

1. A tool that reads the main file
2. A tool that can write to the main file

## Setup

```
bun install
```

```
bun run dev
```

The main file is `index.ts` and the history file is `history.json`.

The main file is the entry point for the agent. It is the file that is being modified by the agent.

The history file is the file that is being read on restart. It is the file that contains the message history.
