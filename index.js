import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send("🚀 Hello from Railway!");
});

const getCustomers = async (companyLocationId) => {
  try {
    const endpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-04/graphql.json`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        query: `
          query GetCompanyLocationCustomers($companyLocationId: ID!) {
            companyLocation(id: $companyLocationId) {
              id
              name
              company {
                id
                name
                customers(first: 10) {
                  edges {
                    node {
                      id
                      firstName
                      lastName
                      email
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { companyLocationId },
      }),
    });

    const result = await response.json();
    if (result.errors) {
      console.error("🛑 Shopify GraphQL errors:", result.errors);
      return res.status(500).json({ error: "Erreur de récupération", details: result.errors });
    }

    // Extract customers
    const customers = result.data.companyLocation.company.customers.edges.map(edge => edge.node);
    res.json(customers);
  } catch (error) {
    console.error("💥 Erreur serveur :", error);
    res.status(500).json({ error: "Erreur serveur", details: error.message });
  }
}
app.post('/assign-staff', async (req, res) => {
  console.log(req.body);
  const { admin_graphql_api_id } = req.body;
  const customers = await getCustomers(getCustomers);

  try {
    const endpoint = `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2025-04/graphql.json`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
      },
      body: JSON.stringify({
        query: `
          mutation companyLocationAssignStaffMembers($companyLocationId: ID!, $staffMemberIds: [ID!]!) {
            companyLocationAssignStaffMembers(companyLocationId: $companyLocationId, staffMemberIds: $staffMemberIds) {
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          companyLocationId,
          staffMemberIds: [staffId],
        },
      }),
    });

    const result = await response.json();
    const errors = result?.data?.companyLocationAssignStaffMembers?.userErrors;

    if (errors) {
      console.error('🛑 Shopify GraphQL errors:', errors);
      return res.status(500).json({ error: "Erreur d'assignation", details: errors });
    }

    console.log("✅ Assignation réussie !");
    res.json({ success: true });
  } catch (error) {
    console.error('💥 Erreur serveur :', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`✅ Serveur lancé sur le port ${port}`);
});
