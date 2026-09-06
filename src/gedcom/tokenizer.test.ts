import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer';

describe('tokenize', () => {
  it('builds a tree and folds CONC/CONT', () => {
    const { records, errors } = tokenize('0 @I1@ INDI\n1 NOTE Hello\n2 CONC  world\n2 CONT Second line\n1 SEX M\n0 TRLR\n');
    expect(errors).toEqual([]);
    expect(records).toHaveLength(2);
    const indi = records[0]!;
    expect(indi.xref).toBe('@I1@');
    expect(indi.children[0]!.value).toBe('Hello world\nSecond line');
    expect(indi.children[1]!.tag).toBe('SEX');
  });

  it('keeps a leading space on CONC (Geneanet does this)', () => {
    const { records } = tokenize('0 @I1@ INDI\n1 NOTE ends with word\n2 CONC  and continues');
    expect(records[0]!.children[0]!.value).toBe('ends with word and continues');
  });

  it('accepts CRLF, BOM and empty value lines', () => {
    const { records, errors } = tokenize('﻿0 HEAD\r\n1 GEDC\r\n2 VERS 5.5.1\r\n1 NOTE\r\n0 TRLR\r\n');
    expect(errors).toEqual([]);
    expect(records[0]!.children[0]!.children[0]!.value).toBe('5.5.1');
    expect(records[0]!.children[1]!.value).toBe('');
  });

  it('reports but survives a level jump and garbage', () => {
    const { records, errors } = tokenize('0 @I1@ INDI\n3 SEX M\nthis is not gedcom\n');
    expect(records).toHaveLength(1);
    expect(errors.map((e) => e.reason)).toEqual(['Level jump from 0 to 3', 'Unparseable line']);
  });
});
