/**
 * AI Demo Example
 * 
 * This example demonstrates the AI system capabilities including behavior trees,
 * pathfinding, and NPC interactions.
 */

import { NPC } from '../src/ai/NPC';
import { BehaviorTree } from '../src/ai/BehaviorTree';
import { ActionNode, ConditionNode, SequenceNode, SelectorNode } from '../src/ai/BehaviorNodes';
import { Pathfinder } from '../src/ai/Pathfinding';
import { MemorySystem } from '../src/ai/MemorySystem';
import { Vector3 } from 'gl-matrix';

// Define behavior status enum
enum BehaviorStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  RUNNING = 'RUNNING'
}

// Define NPC types
enum NPCType {
  VILLAGER = 'villager',
  MERCHANT = 'merchant',
  GUARD = 'guard',
  ANIMAL = 'animal'
}

class AIDemoExample {
  private npcs: NPC[] = [];
  private pathfinder: Pathfinder;
  private world: any;

  constructor() {
    this.initializeAI();
    this.createNPCs();
    this.setupBehaviorTrees();
    this.startSimulation();
  }

  private initializeAI(): void {
    // Initialize pathfinding system
    this.pathfinder = new Pathfinder({
      gridSize: 1,
      worldBounds: { min: [-500, -500], max: [500, 500] }
    });

    console.log('AI system initialized');
  }

  private createNPCs(): void {
    // Create different types of NPCs
    this.createVillager();
    this.createMerchant();
    this.createGuard();
    this.createAnimal();
  }

  private createVillager(): void {
    const villager = new NPC({
      id: 'villager_1',
      name: 'Elder John',
      type: NPCType.VILLAGER,
      position: new Vector3(0, 0, 0),
      behaviorTree: this.createVillagerBehaviorTree(),
      memory: new MemorySystem({
        maxMemories: 50,
        decayRate: 0.1
      })
    });

    this.npcs.push(villager);
    console.log('Created villager: Elder John');
  }

  private createMerchant(): void {
    const merchant = new NPC({
      id: 'merchant_1',
      name: 'Trader Sarah',
      type: NPCType.MERCHANT,
      position: new Vector3(10, 0, 10),
      behaviorTree: this.createMerchantBehaviorTree(),
      memory: new MemorySystem({
        maxMemories: 100,
        decayRate: 0.05
      })
    });

    this.npcs.push(merchant);
    console.log('Created merchant: Trader Sarah');
  }

  private createGuard(): void {
    const guard = new NPC({
      id: 'guard_1',
      name: 'Captain Marcus',
      type: NPCType.GUARD,
      position: new Vector3(-10, 0, -10),
      behaviorTree: this.createGuardBehaviorTree(),
      memory: new MemorySystem({
        maxMemories: 200,
        decayRate: 0.02
      })
    });

    this.npcs.push(guard);
    console.log('Created guard: Captain Marcus');
  }

  private createAnimal(): void {
    const animal = new NPC({
      id: 'animal_1',
      name: 'Wolf Alpha',
      type: NPCType.ANIMAL,
      position: new Vector3(20, 0, 20),
      behaviorTree: this.createAnimalBehaviorTree(),
      memory: new MemorySystem({
        maxMemories: 30,
        decayRate: 0.15
      })
    });

    this.npcs.push(animal);
    console.log('Created animal: Wolf Alpha');
  }

  private createVillagerBehaviorTree(): BehaviorTree {
    // Villager daily routine
    const wakeUp = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} wakes up`);
      npc.setEmotion('awake');
      return BehaviorStatus.SUCCESS;
    });

    const isHungry = new ConditionNode((npc: NPC) => {
      return npc.getStat('hunger') > 0.7;
    });

    const findFood = new ActionNode(async (npc: NPC) => {
      console.log(`${npc.name} is looking for food`);
      const foodLocation = await this.findNearestFood(npc.position);
      if (foodLocation) {
        await npc.moveTo(foodLocation);
        npc.setStat('hunger', 0);
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.FAILURE;
    });

    const work = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} is working`);
      npc.setStat('energy', Math.max(0, npc.getStat('energy') - 0.1));
      return BehaviorStatus.SUCCESS;
    });

    const socialize = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} is socializing`);
      const nearbyNPCs = this.getNearbyNPCs(npc, 10);
      if (nearbyNPCs.length > 0) {
        npc.interactWith(nearbyNPCs[0]);
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.FAILURE;
    });

    const sleep = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} goes to sleep`);
      npc.setEmotion('tired');
      npc.setStat('energy', 1.0);
      return BehaviorStatus.SUCCESS;
    });

    const isTired = new ConditionNode((npc: NPC) => {
      return npc.getStat('energy') < 0.3;
    });

    const dailyRoutine = new SequenceNode([
      wakeUp,
      new SelectorNode([
        new SequenceNode([isHungry, findFood]),
        work
      ]),
      socialize,
      new SequenceNode([isTired, sleep])
    ]);

    return new BehaviorTree(dailyRoutine);
  }

  private createMerchantBehaviorTree(): BehaviorTree {
    // Merchant business behavior
    const openShop = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} opens the shop`);
      npc.setEmotion('business');
      return BehaviorStatus.SUCCESS;
    });

    const hasCustomers = new ConditionNode((npc: NPC) => {
      const customers = this.getNearbyNPCs(npc, 5).filter(n => n.type === NPCType.VILLAGER);
      return customers.length > 0;
    });

    const serveCustomer = new ActionNode((npc: NPC) => {
      const customers = this.getNearbyNPCs(npc, 5).filter(n => n.type === NPCType.VILLAGER);
      if (customers.length > 0) {
        const customer = customers[0];
        console.log(`${npc.name} serves ${customer.name}`);
        npc.interactWith(customer);
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.FAILURE;
    });

    const restock = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} restocks inventory`);
      npc.setStat('inventory', Math.min(1.0, npc.getStat('inventory') + 0.2));
      return BehaviorStatus.SUCCESS;
    });

    const needsRestock = new ConditionNode((npc: NPC) => {
      return npc.getStat('inventory') < 0.3;
    });

    const businessBehavior = new SequenceNode([
      openShop,
      new SelectorNode([
        new SequenceNode([hasCustomers, serveCustomer]),
        new SequenceNode([needsRestock, restock])
      ])
    ]);

    return new BehaviorTree(businessBehavior);
  }

  private createGuardBehaviorTree(): BehaviorTree {
    // Guard patrol and protection behavior
    const patrol = new ActionNode(async (npc: NPC) => {
      console.log(`${npc.name} is patrolling`);
      const patrolPoints = this.getPatrolPoints();
      const nextPoint = this.getNextPatrolPoint(npc, patrolPoints);
      await npc.moveTo(nextPoint);
      return BehaviorStatus.SUCCESS;
    });

    const detectThreat = new ConditionNode((npc: NPC) => {
      const threats = this.getNearbyNPCs(npc, 15).filter(n => n.type === NPCType.ANIMAL);
      return threats.length > 0;
    });

    const investigate = new ActionNode(async (npc: NPC) => {
      console.log(`${npc.name} investigates threat`);
      const threats = this.getNearbyNPCs(npc, 15).filter(n => n.type === NPCType.ANIMAL);
      if (threats.length > 0) {
        await npc.moveTo(threats[0].position);
        npc.setEmotion('alert');
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.FAILURE;
    });

    const protect = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} protects the area`);
      npc.setEmotion('defensive');
      return BehaviorStatus.SUCCESS;
    });

    const guardBehavior = new SelectorNode([
      new SequenceNode([detectThreat, investigate, protect]),
      patrol
    ]);

    return new BehaviorTree(guardBehavior);
  }

  private createAnimalBehaviorTree(): BehaviorTree {
    // Animal hunting and survival behavior
    const hunt = new ActionNode(async (npc: NPC) => {
      console.log(`${npc.name} is hunting`);
      const prey = this.findNearestPrey(npc.position);
      if (prey) {
        await npc.moveTo(prey);
        npc.setStat('hunger', 0);
        return BehaviorStatus.SUCCESS;
      }
      return BehaviorStatus.FAILURE;
    });

    const isHungry = new ConditionNode((npc: NPC) => {
      return npc.getStat('hunger') > 0.6;
    });

    const wander = new ActionNode(async (npc: NPC) => {
      console.log(`${npc.name} is wandering`);
      const randomPoint = this.getRandomPoint(npc.position, 20);
      await npc.moveTo(randomPoint);
      return BehaviorStatus.SUCCESS;
    });

    const rest = new ActionNode((npc: NPC) => {
      console.log(`${npc.name} is resting`);
      npc.setEmotion('calm');
      npc.setStat('energy', Math.min(1.0, npc.getStat('energy') + 0.1));
      return BehaviorStatus.SUCCESS;
    });

    const isTired = new ConditionNode((npc: NPC) => {
      return npc.getStat('energy') < 0.4;
    });

    const animalBehavior = new SelectorNode([
      new SequenceNode([isHungry, hunt]),
      new SequenceNode([isTired, rest]),
      wander
    ]);

    return new BehaviorTree(animalBehavior);
  }

  private setupBehaviorTrees(): void {
    // Initialize behavior trees for all NPCs
    this.npcs.forEach(npc => {
      npc.initialize();
      console.log(`Initialized behavior tree for ${npc.name}`);
    });
  }

  private startSimulation(): void {
    console.log('Starting AI simulation...');
    
    // Start the simulation loop
    setInterval(() => {
      this.updateNPCs();
    }, 1000); // Update every second
  }

  private updateNPCs(): void {
    this.npcs.forEach(npc => {
      // Update NPC behavior
      npc.update(1.0); // 1 second delta time
      
      // Update stats over time
      npc.setStat('hunger', Math.min(1.0, npc.getStat('hunger') + 0.01));
      npc.setStat('energy', Math.max(0, npc.getStat('energy') - 0.005));
    });
  }

  // Helper methods
  private async findNearestFood(position: Vector3): Promise<Vector3 | null> {
    // Simplified food finding - in real implementation, this would query the world
    const foodLocations = [
      new Vector3(5, 0, 5),
      new Vector3(-5, 0, -5),
      new Vector3(15, 0, 15)
    ];
    
    let nearest = null;
    let minDistance = Infinity;
    
    for (const food of foodLocations) {
      const distance = Vector3.distance(position, food);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = food;
      }
    }
    
    return nearest;
  }

  private getNearbyNPCs(npc: NPC, radius: number): NPC[] {
    return this.npcs.filter(other => {
      if (other.id === npc.id) return false;
      const distance = Vector3.distance(npc.position, other.position);
      return distance <= radius;
    });
  }

  private getPatrolPoints(): Vector3[] {
    return [
      new Vector3(-10, 0, -10),
      new Vector3(10, 0, -10),
      new Vector3(10, 0, 10),
      new Vector3(-10, 0, 10)
    ];
  }

  private getNextPatrolPoint(npc: NPC, points: Vector3[]): Vector3 {
    // Simple round-robin patrol
    const currentIndex = Math.floor(Math.random() * points.length);
    return points[currentIndex];
  }

  private findNearestPrey(position: Vector3): Vector3 | null {
    // Simplified prey finding
    const preyLocations = [
      new Vector3(25, 0, 25),
      new Vector3(-25, 0, -25)
    ];
    
    let nearest = null;
    let minDistance = Infinity;
    
    for (const prey of preyLocations) {
      const distance = Vector3.distance(position, prey);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = prey;
      }
    }
    
    return nearest;
  }

  private getRandomPoint(center: Vector3, radius: number): Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * radius;
    
    return new Vector3(
      center[0] + Math.cos(angle) * distance,
      center[1],
      center[2] + Math.sin(angle) * distance
    );
  }

  // Public methods for external control
  public getNPCStatus(): any[] {
    return this.npcs.map(npc => ({
      id: npc.id,
      name: npc.name,
      type: npc.type,
      position: npc.position,
      emotion: npc.emotion,
      stats: {
        hunger: npc.getStat('hunger'),
        energy: npc.getStat('energy'),
        inventory: npc.getStat('inventory')
      }
    }));
  }

  public addNPC(config: any): void {
    const npc = new NPC(config);
    this.npcs.push(npc);
    console.log(`Added new NPC: ${npc.name}`);
  }

  public removeNPC(npcId: string): void {
    const index = this.npcs.findIndex(npc => npc.id === npcId);
    if (index !== -1) {
      const npc = this.npcs.splice(index, 1)[0];
      console.log(`Removed NPC: ${npc.name}`);
    }
  }
}

// Export for use in other modules
export { AIDemoExample, NPCType, BehaviorStatus };

// Auto-start if this file is run directly
if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    try {
      const demo = new AIDemoExample();
      
      // Expose to global scope for debugging
      (window as any).aiDemo = demo;
      
      console.log('AI Demo started successfully');
    } catch (error) {
      console.error('Failed to start AI Demo:', error);
    }
  });
} 