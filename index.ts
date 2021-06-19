import * as azuread from "@pulumi/azuread";
import * as pulumi from "@pulumi/pulumi";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";

import * as containerservice from "@pulumi/azure-native/containerservice";
import * as resources from "@pulumi/azure-native/resources";
import * as containerregistry from "@pulumi/azure-native/containerregistry";
import * as cdn from "@pulumi/azure-native/cdn";
import * as storage from "@pulumi/azure-native/storage";

const resourceGroup = new resources.ResourceGroup("azure-aks-example");

const cdnProfile = new cdn.Profile("profile", {
    resourceGroupName: resourceGroup.name,
    sku: {
        name: cdn.SkuName.Standard_Microsoft,
    },
});

const storageAccount = new storage.StorageAccount("storageaccount", {
    enableHttpsTrafficOnly: true,
    kind: storage.Kind.StorageV2,
    resourceGroupName: resourceGroup.name,
    sku: {
        name: storage.SkuName.Standard_LRS,
    },
});

const staticWebsite = new storage.StorageAccountStaticWebsite("staticWebsite", {
    accountName: storageAccount.name,
    resourceGroupName: resourceGroup.name,
    indexDocument: "index.html",
    error404Document: "404.html",
});

// Upload the files
["index.html", "script.js", "404.html"].map(name =>
    new storage.Blob(name, {
        resourceGroupName: resourceGroup.name,
        accountName: storageAccount.name,
        containerName: staticWebsite.containerName,
        source: new pulumi.asset.FileAsset(`./frontend/${name}`),
        contentType: "text/html",
    }),
);

// Web endpoint to the website
export const staticEndpoint = storageAccount.primaryEndpoints.web;

// add a CDN.
const endpointOrigin = storageAccount.primaryEndpoints.apply(ep => ep.web.replace("https://", "").replace("/", ""));
const endpoint = new cdn.Endpoint("endpoint", {
    endpointName: storageAccount.name.apply(sa => `cdn-endpnt-${sa}`),
    isHttpAllowed: false,
    isHttpsAllowed: true,
    originHostHeader: endpointOrigin,
    origins: [
        {
            hostName: endpointOrigin,
            httpsPort: 443,
            name: "origin-storage-account",
        },
        {
            hostName: "http://exampleaksbackend1906.northeurope.cloudapp.azure.com",
            httpPort: 80,
            name: "aks-backend",
        }
    ],
    profileName: cdnProfile.name,
    queryStringCachingBehavior: cdn.QueryStringCachingBehavior.NotSet,
    resourceGroupName: resourceGroup.name,
});

const adApp = new azuread.Application("aks", {
    displayName: "aks",
});

const adSp = new azuread.ServicePrincipal("aksSp", {
    applicationId: adApp.applicationId,
});

const password = new random.RandomPassword("password", {
    length: 20,
    special: true,
});

const adSpPassword = new azuread.ServicePrincipalPassword("aksSpPassword", {
    servicePrincipalId: adSp.id,
    value: password.result,
    endDate: "2099-01-01T00:00:00Z",
});

const sshKey = new tls.PrivateKey("ssh-key", {
    algorithm: "RSA",
    rsaBits: 4096,
});

const config = new pulumi.Config();
const managedClusterName = config.get("managedClusterName") || "azure-aks";
const cluster = new containerservice.ManagedCluster(managedClusterName, {
    resourceGroupName: resourceGroup.name,
    agentPoolProfiles: [{
        count: 2,
        maxPods: 110,
        mode: "System",
        name: "agentpool",
        nodeLabels: {},
        osDiskSizeGB: 30,
        osType: "Linux",
        type: "VirtualMachineScaleSets",
        vmSize: "Standard_DS2_v2",
    }],
    dnsPrefix: resourceGroup.name,
    enableRBAC: true,
    kubernetesVersion: "1.19.11",
    linuxProfile: {
        adminUsername: "testuser",
        ssh: {
            publicKeys: [{
                keyData: sshKey.publicKeyOpenssh,
            }],
        },
    },
    nodeResourceGroup: `MC_azure-go_${managedClusterName}`,
    servicePrincipalProfile: {
        clientId: adApp.applicationId,
        secret: adSpPassword.value,
    },
});

const registry = new containerregistry.Registry("registry", {
    adminUserEnabled: true,
    registryName: "exampleregistry19062021",
    resourceGroupName: resourceGroup.name,
    sku: {
        name: "Standard"
    },
});

const registryCreds = pulumi.all([registry.name, resourceGroup.name]).apply(([registryName, rgName]) => {
    return containerregistry.listRegistryCredentials({
        registryName: registryName,
        resourceGroupName: rgName,
    });
});

const creds = pulumi.all([cluster.name, resourceGroup.name]).apply(([clusterName, rgName]) => {
    return containerservice.listManagedClusterUserCredentials({
        resourceGroupName: rgName,
        resourceName: clusterName,
    });
});

const encoded = creds.kubeconfigs[0].value;
export const kubeconfig = encoded.apply(enc => Buffer.from(enc, "base64").toString());
export const registryusername = registryCreds.apply(registryCreds => registryCreds.username!);
export const registrypassword = registryCreds.apply(registryCreds => registryCreds.passwords![0].value!);

// CDN endpoint to the website.
// Allow it some time after the deployment to get ready.
export const cdnEndpoint = pulumi.interpolate`https://${endpoint.hostName}/`