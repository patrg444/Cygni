import { RDSClient, CreateDBInstanceCommand, CreateDBSubnetGroupCommand } from '@aws-sdk/client-rds';
import { EC2Client, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand } from '@aws-sdk/client-ec2';
import { nanoid } from 'nanoid';

interface DatabaseSpec {
  projectId: string;
  environment: string;
  size: 'nano' | 'small' | 'medium' | 'large';
  version?: string;
}

const INSTANCE_SPECS = {
  nano: { class: 'db.t3.micro', storage: 10 },
  small: { class: 'db.t3.small', storage: 20 },
  medium: { class: 'db.t3.medium', storage: 50 },
  large: { class: 'db.t3.large', storage: 100 },
};

export class RDSProvisioner {
  private rdsClient: RDSClient;
  private ec2Client: EC2Client;

  constructor(region: string = 'us-east-1') {
    this.rdsClient = new RDSClient({ region });
    this.ec2Client = new EC2Client({ region });
  }

  async provision(spec: DatabaseSpec) {
    const instanceId = `cygni-${spec.projectId}-${spec.environment}-${nanoid(6)}`;
    const sgId = await this.createSecurityGroup(instanceId);
    
    // For dev/preview, use shared instance with logical DBs
    if (spec.environment !== 'production') {
      return this.provisionLogicalDatabase(spec);
    }

    // Production gets dedicated instance
    const command = new CreateDBInstanceCommand({
      DBInstanceIdentifier: instanceId,
      DBInstanceClass: INSTANCE_SPECS[spec.size].class,
      Engine: 'postgres',
      EngineVersion: spec.version || '15.4',
      MasterUsername: 'cygni_admin',
      MasterUserPassword: this.generateSecurePassword(),
      AllocatedStorage: INSTANCE_SPECS[spec.size].storage,
      StorageType: 'gp3',
      StorageEncrypted: true,
      VpcSecurityGroupIds: [sgId],
      DBSubnetGroupName: 'cygni-private-subnet-group',
      BackupRetentionPeriod: 7,
      PreferredBackupWindow: '03:00-04:00',
      PreferredMaintenanceWindow: 'sun:04:00-sun:05:00',
      EnableCloudwatchLogsExports: ['postgresql'],
      DeletionProtection: true,
      Tags: [
        { Key: 'Project', Value: spec.projectId },
        { Key: 'Environment', Value: spec.environment },
        { Key: 'ManagedBy', Value: 'Cygni' },
      ],
    });

    const response = await this.rdsClient.send(command);
    
    // Wait for instance to be available
    await this.waitForInstance(instanceId);
    
    // Create project database and user
    const { database, user, password } = await this.setupDatabase(instanceId, spec.projectId);
    
    return {
      host: response.DBInstance!.Endpoint!.Address,
      port: response.DBInstance!.Endpoint!.Port,
      database,
      user,
      password,
      connectionString: `postgresql://${user}:${password}@${response.DBInstance!.Endpoint!.Address}:${response.DBInstance!.Endpoint!.Port}/${database}?sslmode=require`,
    };
  }

  private async provisionLogicalDatabase(spec: DatabaseSpec) {
    // Connect to shared instance for environment
    const sharedInstance = await this.getSharedInstance(spec.environment);
    
    // Create new database and user
    const database = `${spec.projectId}_${spec.environment}`;
    const user = `${spec.projectId}_user`;
    const password = this.generateSecurePassword();
    
    // Execute SQL to create database and user
    await this.executeSql(sharedInstance, `
      CREATE DATABASE ${database};
      CREATE USER ${user} WITH ENCRYPTED PASSWORD '${password}';
      GRANT ALL PRIVILEGES ON DATABASE ${database} TO ${user};
    `);
    
    return {
      host: sharedInstance.host,
      port: sharedInstance.port,
      database,
      user,
      password,
      connectionString: `postgresql://${user}:${password}@${sharedInstance.host}:${sharedInstance.port}/${database}?sslmode=require`,
    };
  }

  private generateSecurePassword(): string {
    return nanoid(32);
  }
}