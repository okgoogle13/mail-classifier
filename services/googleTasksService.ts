import { MailAnalysisResult } from "../types";

// Types for the Google Global Objects
declare global {
  interface Window {
    gapi: any;
    google: any;
  }
}

// CONFIGURATION
// TODO: REPLACE THIS WITH YOUR ACTUAL GOOGLE CLOUD CLIENT ID
const CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com'; 
const API_KEY = process.env.REACT_APP_GOOGLE_API_KEY || ''; // Optional depending on setup, but Client ID is mandatory for OAuth
const DISCOVERY_DOCS = ['https://www.googleapis.com/discovery/v1/apis/tasks/v1/rest'];
const SCOPES = 'https://www.googleapis.com/auth/tasks';

let tokenClient: any;
let gapiInited = false;
let gisInited = false;

export const initGoogleClient = async (): Promise<void> => {
  return new Promise((resolve) => {
    window.gapi.load('client', async () => {
      await window.gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: DISCOVERY_DOCS,
      });
      gapiInited = true;
      if (gisInited) resolve();
    });

    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: '', // defined later
    });
    gisInited = true;
    if (gapiInited) resolve();
  });
};

export const authenticateGoogle = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp: any) => {
      if (resp.error) {
        reject(resp);
      }
      resolve();
    };

    if (window.gapi.client.getToken() === null) {
      // Prompt the user to select a Google Account and ask for consent to share their data
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      // Skip display of account chooser and consent dialog for an existing session
      tokenClient.requestAccessToken({ prompt: '' });
    }
  });
};

export const createTask = async (item: MailAnalysisResult) => {
  // Format Deadline to RFC 3339 timestamp (required by API)
  let due = null;
  if (item.deadline && item.deadline !== 'None' && item.deadline.match(/^\d{4}-\d{2}-\d{2}$/)) {
    // Set due date to noon on that day to avoid timezone edge cases shifting the day
    due = new Date(item.deadline + 'T12:00:00Z').toISOString();
  }

  const task = {
    title: `[ACTION] ${item.sender}: ${item.suggestedFilename}`,
    notes: `Reason: ${item.reason}\nItem ID: ${item.itemId}\nOriginal Addressee: ${item.addressee}\nTag: ${item.tag}`,
    due: due, // If null, no due date is set
  };

  try {
    const response = await window.gapi.client.tasks.tasks.insert({
      tasklist: '@default',
      resource: task,
    });
    return response.result;
  } catch (err) {
    console.error("Error creating task", err);
    throw err;
  }
};