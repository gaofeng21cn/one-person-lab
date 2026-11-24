import { runDomainImageGeneration } from '../../../../adapters/execution/index.ts';
import {
  assertNoArgs,
  buildCommandHelp,
  parseRegisteredCommandOptions,
} from '../../modules/support.ts';
import type { CommandSpec } from '../../modules/support.ts';

export function buildImageCommandSpecs(): Record<string, CommandSpec> {
  const specs: Record<string, CommandSpec> = {
    image: {
      usage: 'opl image <generate> [options]',
      summary: 'Run OPL-hosted image operations using the configured Codex model provider without owning domain visual truth.',
      examples: [
        'opl image generate --prompt "Minimal monochrome geometric emblem." --output /tmp/emblem.png --json',
      ],
      group: 'image',
      subcommands: [
        {
          command: 'image generate',
          usage: 'opl image generate --prompt <text> --output <path> [--model <id>] [--size <WxH|auto>] [--quality <auto|low|medium|high>] [--background <auto|opaque|transparent>] [--reference <path>] [--timeout-ms <ms>]',
          summary: 'Generate or edit one PNG image artifact using the caller active Codex provider without retries.',
        },
      ],
      handler: (args) => {
        assertNoArgs(args, specs.image);
        return buildCommandHelp('image', specs.image);
      },
    },
    'image generate': {
      usage: 'opl image generate --prompt <text> --output <path> [--model <id>] [--size <WxH|auto>] [--quality <auto|low|medium|high>] [--background <auto|opaque|transparent>] [--reference <path>] [--timeout-ms <ms>]',
      summary: 'Generate or edit one PNG image artifact via the configured Codex Images API without claiming domain or visual quality truth.',
      examples: [
        'opl image generate --prompt "Clean vector diagram of a cell membrane." --output ./figure.png --size 1024x1024 --quality high --json',
      ],
      group: 'image',
      handler: async (args) => {
        const command = 'image generate';
        const parsed = parseRegisteredCommandOptions(command, args, specs[command]);
        const receipt = await runDomainImageGeneration({
          prompt: parsed.prompt as string,
          output_path: parsed.output as string,
          ...(typeof parsed.model === 'string' ? { model: parsed.model } : {}),
          ...(typeof parsed.size === 'string' ? { size: parsed.size } : {}),
          ...(typeof parsed.quality === 'string'
            ? { quality: parsed.quality as 'auto' | 'low' | 'medium' | 'high' }
            : {}),
          ...(typeof parsed.background === 'string'
            ? { background: parsed.background as 'auto' | 'opaque' | 'transparent' }
            : {}),
          ...(Array.isArray(parsed.reference)
            ? { reference_image_paths: parsed.reference as string[] }
            : {}),
          ...(typeof parsed['timeout-ms'] === 'number' ? { timeout_ms: parsed['timeout-ms'] } : {}),
        });
        return {
          version: 'g2',
          domain_image_generation: receipt,
        };
      },
    },
  };
  return specs;
}
