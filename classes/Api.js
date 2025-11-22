import axios from 'axios';
import { config } from '../utils/config.js';

export class Api {
  constructor() {
    this.baseUrl = 'https://api.sellauth.com/v1/';
    this.apiKey = config.SA_API_KEY;
    this.shopId = config.SA_SHOP_ID;
  }

  async get(endpoint) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (error) {
      throw { message: 'Invalid response', error: error.message };
    }
  }

  async post(endpoint, data) {
    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw { message: 'Invalid response', error: error.message };
    }
  }

  async put(endpoint, data) {
    try {
      const response = await axios.put(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      throw { message: 'Invalid response', error: error.message };
    }
  }

  async delete(endpoint) {
    try {
      const response = await axios.delete(`${this.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });
      return response.data;
    } catch (error) {
      throw { message: 'Invalid response', error: error.message };
    }
  }
}
