import { extractContext, extractLinks, hasExtractableContent } from './extractor';
import type { InboundMessage, ChannelConfig } from './types';

const testConfig: ChannelConfig = {
  enabledPlatforms: ['telegram', 'whatsapp', 'discord', 'slack'],
  autoExtract: {
    links: true,
    notes: false,
    tasks: false,
    reminders: false,
  },
  commandPrefix: '/',
  sendConfirmations: true,
};

const makeMessage = (body: string): InboundMessage => ({
  body,
  rawBody: body,
  platform: 'telegram',
  chatType: 'direct',
  sender: { id: '123', name: 'Test User' },
});

describe('extractLinks', () => {
  it('extracts URLs from text', () => {
    const text = 'Check out https://example.com and https://github.com/test';
    const links = extractLinks(text);

    expect(links).toHaveLength(2);
    expect(links[0].url).toBe('https://example.com');
    expect(links[1].url).toBe('https://github.com/test');
  });

  it('deduplicates URLs', () => {
    const text = 'Visit https://example.com twice: https://example.com';
    const links = extractLinks(text);

    expect(links).toHaveLength(1);
  });

  it('returns empty array for no URLs', () => {
    const links = extractLinks('No links here');
    expect(links).toHaveLength(0);
  });
});

describe('extractContext', () => {
  it('auto-extracts links when enabled', () => {
    const message = makeMessage('Check this: https://news.ycombinator.com/item?id=123');
    const context = extractContext(message, testConfig);

    expect(context.isCommand).toBe(false);
    expect(context.links).toHaveLength(1);
    expect(context.links[0].url).toBe('https://news.ycombinator.com/item?id=123');
  });

  it('parses /save command', () => {
    const message = makeMessage('/save https://example.com');
    const context = extractContext(message, testConfig);

    expect(context.isCommand).toBe(true);
    expect(context.command).toBe('save');
    expect(context.links).toHaveLength(1);
  });

  it('parses /note command', () => {
    const message = makeMessage('/note Remember to buy milk #shopping');
    const context = extractContext(message, testConfig);

    expect(context.isCommand).toBe(true);
    expect(context.command).toBe('note');
    expect(context.notes).toHaveLength(1);
    expect(context.notes[0].content).toContain('Remember to buy milk');
    expect(context.notes[0].tags).toContain('shopping');
  });

  it('parses /task command with priority', () => {
    const message = makeMessage('/task Fix the bug !high');
    const context = extractContext(message, testConfig);

    expect(context.isCommand).toBe(true);
    expect(context.command).toBe('task');
    expect(context.tasks).toHaveLength(1);
    expect(context.tasks[0].title).toBe('Fix the bug');
    expect(context.tasks[0].priority).toBe('high');
  });

  it('parses /remind command with relative time', () => {
    const message = makeMessage('/remind call mom in 2 hours');
    const context = extractContext(message, testConfig);

    expect(context.isCommand).toBe(true);
    expect(context.command).toBe('remind');
    expect(context.reminders).toHaveLength(1);
    expect(context.reminders[0].message).toContain('call mom');
    expect(context.reminders[0].time).toBeDefined();
  });
});

describe('hasExtractableContent', () => {
  it('returns true for commands', () => {
    const message = makeMessage('/save something');
    expect(hasExtractableContent(message, testConfig)).toBe(true);
  });

  it('returns true for URLs when auto-extract enabled', () => {
    const message = makeMessage('Check https://example.com');
    expect(hasExtractableContent(message, testConfig)).toBe(true);
  });

  it('returns false for plain text', () => {
    const message = makeMessage('Just a regular message');
    expect(hasExtractableContent(message, testConfig)).toBe(false);
  });
});
