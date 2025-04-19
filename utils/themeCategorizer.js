function categorizeProjectTheme(projectData) {
    const blockCategories = {
        music: ["newnote", "osctime", "pitch", "playdrum", "hertz", "pitchnumber", "nthmodalpitch", "steppitch", "rest2", "tempo", "timbre", "musickeyboard", "interval", "definemode", "temperament", "voicename", "drumname", "effectsname", "filtertype", "oscillatortype", "modename", "chordname", "accidentalname", "noisename", "customNote"],
        art: ["draw", "color", "shape", "turtle", "penup", "pendown", "setcolor", "setwidth", "setposition", "setheading", "forward", "backward", "right", "left", "arc", "circle", "rectangle", "triangle", "polygon", "stamp", "clear"],
        math: ["add", "subtract", "multiply", "divide", "mod", "sqrt", "pow", "abs", "round", "floor", "ceil", "random", "min", "max", "sin", "cos", "tan", "asin", "acos", "atan", "log", "exp", "pi", "e", "greater", "less", "equal", "notequal", "and", "or", "not", "true", "false"],
        general: ["start", "action", "repeat", "if", "else", "wait", "forever", "stop", "print", "input", "variable", "setvariable", "getvariable", "list", "addtolist", "removefromlist", "lengthoflist", "itemoflist", "clearlist", "function", "callfunction", "return"]
    };

    const blocks = JSON.parse(projectData);
    const themeCounts = { music: 0, art: 0, math: 0, general: 0 };

    blocks.forEach(block => {
        let blockName = Array.isArray(block[1]) ? block[1][0] : block[1]; 

        for (const [theme, themeBlocks] of Object.entries(blockCategories)) {
            if (themeBlocks.includes(blockName)) {
                themeCounts[theme]++;
                break; 
            }
        }
    });

    const sortedThemes = Object.entries(themeCounts).sort((a, b) => b[1] - a[1]);
    return sortedThemes[0][1] > 0 ? sortedThemes[0][0] : "unknown"; 
}
module.exports = categorizeProjectTheme;