import { SubAgent } from './types';

export const validatorAgent: SubAgent = {
  name: 'VALIDATOR',
  async run(args) {
    return {
      content: ['VALIDATOR stub – ho ricevuto questi argomenti:', JSON.stringify(args, null, 2)].join('\n'),
      metadata: { routedTo: 'VALIDATOR' },
    };
  },
};

export default validatorAgent;
