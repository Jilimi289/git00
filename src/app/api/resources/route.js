import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const owner = process.env.GITHUB_OWNER;
const repo = process.env.GITHUB_REPO;
const githubPath = 'data/json/resources.json';
const localPath = path.join(process.cwd(), 'data', 'json', 'resources.json');

async function getResourcesFromGitHub() {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: githubPath,
    });

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error fetching resources from GitHub:', error);
    throw error;
  }
}

function getLocalResources() {
  return JSON.parse(fs.readFileSync(localPath, 'utf8'));
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const source = searchParams.get('source');

  if (source === 'github') {
    try {
      const resources = await getResourcesFromGitHub();
      return NextResponse.json(resources);
    } catch (error) {
      return NextResponse.json({ error: 'Failed to fetch resources from GitHub' }, { status: 500 });
    }
  } else {
    // Default to local file for homepage
    const resources = getLocalResources();
    return NextResponse.json(resources);
  }
}

export async function POST(req) {
  const updatedResources = await req.json();

  try {
    console.log('Attempting to update resources on GitHub');
    console.log('GitHub config:', {
      owner: process.env.GITHUB_OWNER || 'Not set',
      repo: process.env.GITHUB_REPO || 'Not set',
      path: githubPath,
      hasToken: !!process.env.GITHUB_TOKEN,
    });

    // Try to update GitHub first
    try {
      // Get current file info
      const { data: currentFile } = await octokit.repos.getContent({
        owner,
        repo,
        path: githubPath,
      });
      
      console.log('Current file found, sha:', currentFile.sha);

      // Update the file
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: githubPath,
        message: 'Update resources',
        content: Buffer.from(JSON.stringify(updatedResources, null, 2)).toString('base64'),
        sha: currentFile.sha,
      });
      
      console.log('GitHub file updated successfully');
      
      // Only try to update local file in development environment
      if (process.env.NODE_ENV === 'development') {
        try {
          fs.writeFileSync(localPath, JSON.stringify(updatedResources, null, 2));
          console.log('Local file updated successfully');
        } catch (localError) {
          console.error('Error updating local file:', localError);
          // Continue executing, as GitHub update was successful
        }
      }

      return NextResponse.json(updatedResources);
    } catch (githubError) {
      console.error('GitHub API error details:', githubError);
      
      // If GitHub update failed and we're in development, try to update local file only
      if (process.env.NODE_ENV === 'development') {
        try {
          fs.writeFileSync(localPath, JSON.stringify(updatedResources, null, 2));
          console.log('Local file updated successfully (GitHub update failed)');
          return NextResponse.json(updatedResources);
        } catch (localError) {
          console.error('Error updating local file:', localError);
          throw new Error('Failed to update both GitHub and local files');
        }
      } else {
        throw new Error('Failed to update GitHub file and not in development environment');
      }
    }
  } catch (error) {
    console.error('Error updating resources:', error.message);
    if (error.response) {
      console.error('GitHub API response status:', error.response.status);
      console.error('GitHub API response data:', error.response.data);
    }
    return NextResponse.json({ error: 'Failed to update resources' }, { status: 500 });
  }
}
