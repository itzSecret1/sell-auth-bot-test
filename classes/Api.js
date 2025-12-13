import axios from 'axios';
import { config } from '../utils/config.js';

export class Api {
  constructor() {
    this.baseUrl = 'https://api.sellauth.com/v1/';
    this.apiKey = config.SA_API_KEY;
    this.shopId = config.SA_SHOP_ID;
  }

  async get(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseUrl}${endpoint}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        params: params,
        timeout: 15000
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

  async getAllPages(endpoint, maxPerPage = 100, maxPages = 100) {
    try {
      console.log(`[API] Fetching all pages from ${endpoint}`);
      let allItems = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= maxPages) {
        try {
          const response = await this.get(endpoint, { page, perPage: maxPerPage });
          
          // Parse Laravel pagination response
          let pageItems = [];
          if (Array.isArray(response?.data)) {
            pageItems = response.data;
          } else if (Array.isArray(response)) {
            pageItems = response;
          }

          if (pageItems.length === 0) {
            hasMore = false;
            console.log(`[API] Page ${page}: No items (end of results)`);
          } else {
            allItems = allItems.concat(pageItems);
            console.log(`[API] Page ${page}: +${pageItems.length} items (total: ${allItems.length})`);
            
            // Check if there are more pages
            if (response?.next_page_url) {
              page++;
            } else {
              hasMore = false;
            }
          }
        } catch (e) {
          console.error(`[API] Page ${page} error:`, e.message);
          hasMore = false;
        }
      }

      console.log(`[API] Total items fetched: ${allItems.length}`);
      return allItems;
    } catch (error) {
      console.error(`[API] getAllPages error:`, error.message);
      throw error;
    }
  }
}
