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
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`[API GET] ${endpoint} - Status: ${status}`, data);
      throw { message: 'Invalid response', status, data, error: error.message };
    }
  }

  async post(endpoint, data) {
    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const respData = error.response?.data;
      console.error(`[API POST] ${endpoint} - Status: ${status}`, respData);
      throw { message: 'Invalid response', status, data: respData, error: error.message };
    }
  }

  async put(endpoint, data) {
    try {
      const response = await axios.put(`${this.baseUrl}${endpoint}`, data, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const respData = error.response?.data;
      console.error(`[API PUT] ${endpoint} - Status: ${status}`, respData);
      throw { message: 'Invalid response', status, data: respData, error: error.message };
    }
  }

  async delete(endpoint) {
    try {
      const response = await axios.delete(`${this.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const data = error.response?.data;
      console.error(`[API DELETE] ${endpoint} - Status: ${status}`, data);
      throw { message: 'Invalid response', status, data, error: error.message };
    }
  }
}
