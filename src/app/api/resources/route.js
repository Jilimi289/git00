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

    try {
      // 先获取当前文件信息
      const { data: currentFile } = await octokit.repos.getContent({
        owner,
        repo,
        path: githubPath,
      });
      
      console.log('Current file found, sha:', currentFile.sha);

      // 然后尝试更新文件
      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: githubPath,
        message: 'Update resources',
        content: Buffer.from(JSON.stringify(updatedResources, null, 2)).toString('base64'),
        sha: currentFile.sha,
      });
      
      console.log('GitHub file updated successfully');
      
      // 更新本地文件（确保本地路径存在）
      try {
        fs.writeFileSync(localPath, JSON.stringify(updatedResources, null, 2));
        console.log('Local file updated successfully');
      } catch (localError) {
        console.error('Error updating local file:', localError);
        // 继续执行，不阻止响应，因为GitHub更新已成功
      }

      return NextResponse.json(updatedResources);
    } catch (githubError) {
      console.error('GitHub API error details:', githubError);
      
      // 如果GitHub更新失败，尝试只更新本地文件
      try {
        fs.writeFileSync(localPath, JSON.stringify(updatedResources, null, 2));
        console.log('Local file updated successfully (GitHub update failed)');
        return NextResponse.json(updatedResources);
      } catch (localError) {
        console.error('Error updating local file:', localError);
        throw new Error('Failed to update both GitHub and local files');
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
