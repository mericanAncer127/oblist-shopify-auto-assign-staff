import express from 'express';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import bodyParser from 'body-parser';
import cors from 'cors';

dotenv.config();
const app = express();

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

app.get('/', (req, res) => {
  res.send("🚀 Hello from Railway!");
});

// ✅ Function to Get Customers for a Given Company Location
const getAssignedStaff = async (companyLocationId) => {
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
          query GetCompanyLocation($companyLocationId: ID!) {
            companyLocation(id: $companyLocationId) {
              id
              company {
                id
                contacts(first: 10){
                  nodes{
                    customer {
                      id
                      firstName
                      lastName
                      metafield(namespace: "custom", key: "assigned_staff_email"){
                        jsonValue
                      }
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
      return [];
    }

    const contacts =  result.data?.companyLocation?.company?.contacts?.nodes?.map(node => node?.customer?.metafield?.jsonValue);
    console.log(contacts);
    const staffEmail = contacts.find(email => email != undefined);
    return staffEmail;
  } catch (error) {
    console.error("💥 Erreur serveur :", error);
    return [];
  }
};

// ✅ POST Endpoint to Assign Staff
app.post('/assign-staff', async (req, res) => {
  console.log(req.body);

  const { admin_graphql_api_id } = req.body;
  if (!admin_graphql_api_id) {
    return res.status(400).json({ error: "Missing companyLocationId or staffId" });
  }

  const staff = await getAssignedStaff(admin_graphql_api_id);
  console.log("📋 /Staff  :", staff);

  const staffId = staff == 'megan@oblist.com' ? 'gid://shopify/StaffMember/129852932361' : 'gid://shopify/StaffMember/114304090377';
  console.log(staffId)

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
              companyLocationStaffMemberAssignments {
                staffMember {
                  email
                  id
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
        variables: {
          companyLocationId: admin_graphql_api_id,
          staffMemberIds: [staffId],
        },
      }),
    });

    const result = await response.json();
    const errors = result?.data?.companyLocationAssignStaffMembers?.userErrors;
    const data = result?.data?.companyLocationAssignStaffMembers?.companyLocationStaffMemberAssignments;

    if(result?.errors)
    {
      console.error('🛑 Shopify GraphQL errors:', result?.errors);
      return res.status(500).json({ error: "Erreur d'assignation", details: result?.errors });
    }

    if (errors && errors.length > 0) {
      console.error('🛑 Shopify GraphQL errors:', errors);
      return res.status(500).json({ error: "Erreur d'assignation", details: errors });
    }

    console.log(data);

    console.log("✅ Assignation réussie !");
    res.json({ success: true });
  } catch (error) {
    console.error('💥 Erreur serveur :', error);
    res.status(500).json({ error: 'Erreur serveur', details: error.message });
  }
});

// ✅ Start the Server
const port = process.env.PORT || 8000;
app.listen(port, () => {
  console.log(`✅ Serveur lancé sur le port ${port}`);
});
