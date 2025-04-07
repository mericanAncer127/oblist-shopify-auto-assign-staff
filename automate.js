import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const SHOP = process.env.SHOPIFY_STORE_DOMAIN;
const ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'oblist-auto-assign-staff';
const COLLECTION_NAME = 'companylocations';

const client = new MongoClient(MONGODB_URI);

async function fetchCompanyLocations(after = null) {
  const query = `
    query($after: String) {
      companyLocations(first: 100, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            name
            company {
              id
              name
            }
          }
        }
      }
    }
  `;

  const response = await fetch(`https://${SHOP}/admin/api/2024-01/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': ACCESS_TOKEN,
    },
    body: JSON.stringify({ query, variables: { after } }),
  });

  const result = await response.json();

  if (result.errors) {
    console.error('GraphQL errors:', result.errors);
    return [];
  }

  const { edges, pageInfo } = result.data.companyLocations;

  return {
    locations: edges.map(edge => edge.node),
    pageInfo,
  };
}

async function getAllCompanyLocations() {
  let allLocations = [];
  let after = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const { locations, pageInfo } = await fetchCompanyLocations(after);
    allLocations.push(...locations);
    after = pageInfo.endCursor;
    hasNextPage = pageInfo.hasNextPage;
  }

  return allLocations;
}

async function detectNewLocations(latestLocations, storedLocations) {
  const storedIds = new Set(storedLocations.map(loc => loc.id));
  return latestLocations.filter(loc => !storedIds.has(loc.id));
}

async function main() {
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    const latestLocations = await getAllCompanyLocations();
    const storedLocations = await collection.find({}).toArray();

    const newLocations = await detectNewLocations(latestLocations, storedLocations);

    if (newLocations.length > 0) {
      for(let i = 0; i < newLocations.length; i++){
        const admin_graphql_api_id = newLocations[i]?.id;

        console.log(admin_graphql_api_id);
        await fetch("https://oblist-shopify-auto-assign-staff.vercel.app/assign-staff", {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ admin_graphql_api_id: admin_graphql_api_id }),
        })
      }
      console.log(`🟢 Detected ${newLocations.length} new location(s):`);
      newLocations.forEach(loc => {
        console.log(`- ${loc.name} (${loc.company.name})`);
      });

      // ✅ Trigger your action here (email, webhook, notification...)

      // Update stored data
      await collection.deleteMany({});
      await collection.insertMany(latestLocations);
    } else {
      console.log('✅ No new company locations.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await client.close();
  }
}

main();
