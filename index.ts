import * as azuread from "@pulumi/azuread"
import * as pulumi from "@pulumi/pulumi"
import * as random from "@pulumi/random"
import * as tls from "@pulumi/tls"

import * as containerservice from "@pulumi/azure-native/containerservice"
import * as resources from "@pulumi/azure-native/resources"
import * as containerregistry from "@pulumi/azure-native/containerregistry"

const resourceGroup = new resources.ResourceGroup("azure-aks-example");

const adApp = new azuread.Application("aks", {
    displayName: "aks",
})

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