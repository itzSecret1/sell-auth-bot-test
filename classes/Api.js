import fetch from 'node-fetch';
import { config } from '../utils/config.js';

export class Api {
  constructor() {
    this.baseUrl = 'https://api.sellauth.com/v1/';
    this.apiKey = config.SA_API_KEY;
    this.shopId = config.SA_SHOP_ID;
  }

  async get(endpoint) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });

    if (!response.ok) {
      throw { message: 'Invalid response', response };
    }

    return await response.json();
  }

  async post(endpoint, data) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw { message: 'Invalid response', response };
    }

    return await response.json();
  }

  async put(endpoint, data) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      throw { message: 'Invalid response', response };
    }

    return await response.json();
  }

  async delete(endpoint) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });

    if (!response.ok) {
      throw { message: 'Invalid response', response };
    }

    return await response.json();
  }
}
