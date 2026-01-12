import { SubAgent } from './types';

export const generatorAgent: SubAgent = {
  name: 'GENERATOR',
  async run(args) {
    return {
      content: ['GENERATOR stub – ho ricevuto questi argomenti:', JSON.stringify(args, null, 2)].join('\n'),
      metadata: { routedTo: 'GENERATOR' },
    };
  },
};

export default generatorAgent;
