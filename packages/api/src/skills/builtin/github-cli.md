---
name: github-cli
version: "1.0.0"
displayName: GitHub CLI
description: Interact with GitHub using the gh command-line tool
type: cli
emoji: "\U0001F419"
category: developer
tags:
  - github
  - git
  - cli
  - developer
  - code
author: GitHub

triggers:
  keywords:
    - github
    - gh
    - pull request
    - pr
    - issue
    - repo
  intents:
    - github_operations

capabilities:
  shell: true
  network: true

requirements:
  bins:
    - gh
  config:
    - ~/.config/gh/hosts.yml

install:
  - kind: brew
    formula: gh
    bins:
      - gh
  - kind: manual
    url: https://cli.github.com
    instructions: Visit https://cli.github.com for installation options

cli:
  bin: gh
  commands:
    - name: pr list
      description: List pull requests
      toolName: gh_pr_list
      args: "pr list"
    - name: pr view
      description: View a pull request
      toolName: gh_pr_view
      args: "pr view"
      argMode: raw
    - name: issue list
      description: List issues
      toolName: gh_issue_list
      args: "issue list"
    - name: issue view
      description: View an issue
      toolName: gh_issue_view
      args: "issue view"
      argMode: raw
    - name: repo view
      description: View repository info
      toolName: gh_repo_view
      args: "repo view"
---

# GitHub CLI

Wrapper for the GitHub CLI (`gh`) for interacting with GitHub repositories.

## Prerequisites

1. Install `gh` via Homebrew: `brew install gh`
2. Authenticate: `gh auth login`

## Available Commands

### Pull Requests
- `gh pr list` - List PRs in current repo
- `gh pr view [number]` - View PR details
- `gh pr create` - Create a new PR
- `gh pr checkout [number]` - Check out a PR branch

### Issues
- `gh issue list` - List issues
- `gh issue view [number]` - View issue details
- `gh issue create` - Create a new issue

### Repository
- `gh repo view` - View current repo info
- `gh repo clone [repo]` - Clone a repository

## Usage Notes

- Commands run in the context of the current git repository
- Use `--repo owner/repo` to target a specific repository
- JSON output available with `--json` flag
