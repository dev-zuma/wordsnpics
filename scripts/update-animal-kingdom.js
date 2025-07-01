const dbService = require('../database/wordsnpics-db');

async function updateAnimalKingdom() {
    try {
        await dbService.initialize();
        
        console.log('🐾 Updating Animal Kingdom board prompt...');
        
        const newPrompt = `For this topic, go beyond just animal names or categories. Choose themes that explore unique animal behaviors, traits, habitats, survival strategies, diets, adaptations, or evolutionary quirks. Each theme should be conceptually rich — for example: "Nocturnal Hunters," "Built to Fly," "Desert Survivors," "Animal Architects," or "Colorful Defenses." Words should represent concepts or features tied to how animals live, move, survive, or interact with the world — not just the animals themselves.`;
        
        dbService.db.run(`
            UPDATE board_types 
            SET prompt = ?
            WHERE id = 'animal-kingdom'
        `, [newPrompt]);
        
        // Save changes
        await dbService.saveDatabase();
        
        console.log('✅ Updated Animal Kingdom board prompt');
        
        // Verify the update
        const boardTypes = await dbService.getBoardTypes();
        const animalKingdom = boardTypes.find(bt => bt.id === 'animal-kingdom');
        if (animalKingdom) {
            console.log('\n📋 New prompt:');
            console.log(animalKingdom.prompt);
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

updateAnimalKingdom();