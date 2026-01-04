/* Code to create new hashed passwords */
/* Copy and paste into ServiceNow password column */

/* Change the amount of hash cycles as needed */
(async () => {
    console.log(await bcrypt.hash("[password]", [number])); 
})(); 

/* 
Example:

(async () => {
    console.log(await bcrypt.hash("123456", 12)); 
})(); 
*/