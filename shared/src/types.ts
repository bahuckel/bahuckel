/**
 * Shared types for Bahuckel (decentralized voice and text chat).
 */

export type Snowflake = string;

export interface User {
  id: Snowflake;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  publicKey?: string; // for E2EE identity
}

export interface Server {
  id: Snowflake;
  name: string;
  iconUrl?: string;
  ownerId: Snowflake;
  nodeId: string; // which federated node hosts this server
}

export type ChannelType = 'text' | 'voice';

export interface Channel {
  id: Snowflake;
  serverId: Snowflake;
  name: string;
  type: ChannelType;
  position: number;
}

export interface Message {
  id: Snowflake;
  channelId: Snowflake;
  authorId: Snowflake;
  content: string;
  createdAt: string; // ISO
  editedAt?: string;
  encrypted?: boolean;
}

export interface Presence {
  userId: Snowflake;
  status: 'online' | 'away' | 'busy' | 'offline';
  channelId?: Snowflake; // if in a voice channel
}
