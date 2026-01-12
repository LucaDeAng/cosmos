import { SubAgent } from './types';

export const explorerAgent: SubAgent = {
  name: 'EXPLORER',
  async run(args) {
    return {
      content: ['EXPLORER stub – ho ricevuto questi argomenti:', JSON.stringify(args, null, 2)].join('\n'),
      metadata: { routedTo: 'EXPLORER' },
    };
  },
};

export default explorerAgent;
