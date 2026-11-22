import { Config } from '@remotion/cli/config';

Config.setEntryPoint('src/index.ts');
// transparent WebM (Chrome/Firefox play alpha)
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuva420p');
Config.setCodec('vp9');
