const fs = require('fs');
const DEF_PAGE_SIZE = 0xffff;
const MAGIC_VALUE_SEQ = Buffer.from("LSDB");

let cmp_seq = (seq1, seq2) => {
    let i = 0;
    while(true) {
        if(seq1[i] == 0 || seq2[i] == 0 || !seq1[i] || !seq2[i]) return true;
        if(seq1[i] == seq2[i]) {
            i++;
        } else {
            return false;
        }
    }
    return true;
}


class DataBase {
    constructor(file_name) {
        this.file_name = file_name;
        if(fs.existsSync(file_name)) {
            // WIP, database loader
        } else {
            this.buffer = [Buffer.from(new Uint8Array(256))];
            this.buffer[0][0] = 1;
            this.buffer[0][1] = 0;
        }
    }
    getByte(addr) {
        if(addr >= this.buffer[0].length) {
            return this.buffer[1][addr-this.buffer[0].length];
        }
        return this.buffer[0][addr];
    }
    getByteT(addr, table_n) {
        return this.buffer[table_n][addr];
    }
    getWord(addr) {
        return (this.getByte(addr) << 8) | this.getByte(addr+1);
    }
    getWordT(addr, table_n) {
        return (this.getByteT(addr, table_n) << 8) | this.getByteT(addr+1, table_n);
    }
    getDWord(addr) {
        return (this.getWord(addr) << 16) | this.getWord(addr+2);
    }
    getDWordT(addr, table_n) {
        return (this.getWordT(addr, table_n) << 16) | this.getWordT(addr+2, table_n);
    }
    setByte(addr, byte) {
        if(addr >= this.buffer[0].length) {
            this.buffer[1][addr-this.buffer[0].length] = byte&0xff;
            return;
        }
        this.buffer[0][addr] = byte&0xff;
    }
    setByteT(addr, byte, table_n) {
        this.buffer[table_n][addr] = byte;
    }
    setWord(addr, word) {
        this.setByte(addr, word>>8);
        this.setByte(addr+1, word&0xff);
    }
    setWordT(addr, word, table_n) {
        this.setByteT(addr, word>>8, table_n);
        this.setByteT(addr+1, word&0xff, table_n);
    }
    setDWord(addr, dword) {
        this.setWord(addr, dword>>16);
        this.setWord(addr+2, dword&0xffff);
    }
    setDWordT(addr, dword, table_n) {
        this.setWordT(addr, dword>>16, table_n);
        this.setWordT(addr+2, dword&0xffff, table_n);
    }
    flush() {
        let concatedarray = Buffer.concat([MAGIC_VALUE_SEQ, this.buffer].flat(1));
        fs.writeFileSync(this.file_name, concatedarray);
    }
    malloc(size, table) {
        let found = false;
        let addr = 0;
        while(!found) {
            let buf_addr = this.getWordT(addr, table);
            if(buf_addr > 0x7fff) { // found_free
                if(((buf_addr & 0x7fff) - 3 - addr) >= size) {
                    break;
                } else {
                    addr = buf_addr & 0x7fff;
                }
            } else {
                addr = buf_addr & 0x7fff;
            }
        }
        let pointer_to_next = addr+size+2;
        this.setWordT(pointer_to_next, this.getWordT(addr, table), table);
        this.setWordT(addr, pointer_to_next&0x7fff, table);
        return addr+2;
    }
    cmalloc(size,addr, table) {
        let found = false;
        
        while(!found) {
            let buf_addr = this.getWordT(addr, table);
            if(buf_addr > 0x7fff) { // found_free
                if(((buf_addr & 0x7fff) - 3 - addr) >= size) {
                    break;
                } else {
                    addr = buf_addr & 0x7fff;
                }
            } else {
                addr = buf_addr & 0x7fff;
            }
        }
        let pointer_to_next = addr+size+2;
        this.setWordT(pointer_to_next, this.getWordT(addr, table), table);
        this.setWordT(addr, pointer_to_next&0x7fff, table);
        return addr+2;
    }
    free(addr, table) {
        if(addr > 0x7fff || this.getWordT(addr-2, table) > 0x7fff) {
            return;
        }
        let size = this.getWordT(addr-2, table) - addr;
        for(let i = 0; i < size; i++) {
            this.setByteT(addr+i, 0, table);
        }
        let is_next_free = (this.getWordT(this.getWordT(addr-2, table), table) ) > 0x7fff;
        if(is_next_free) {
            let buf_ = this.getWord(addr-2, table);
            this.setWordT(addr-2, this.getWordT(this.getWordT(addr-2, table), table), table);
            this.setWordT(buf_, 0, table);
        } else {
            this.setWordT(addr-2, this.getWordT(addr-2, table)|0x8000, table);
        }
    }
    memcpy(dest, size, table1, src, table2) {
        for(let i = 0 ; i < size; i++) {
            this.setByteT(dest+i, this.getByteT(src+i, table2), table1);
        }
    }
    meminsert(dest, size, table, raw) {
        for(let i = 0; i < size; i ++) {
            this.setByteT(dest+i, raw[i], table);
        }
    }
    memcpy(src1, size, table1, src2, table2) {
        for(let i = 0; i < size; i++) {
            if(this.getByteT(src1+i, table1) != this.getByteT(src2+i, table2)) return false;
        }
        return true;
    }
    memcpy_raw(src1, size, table, raw) {
        for(let i = 0; i < size; i++) {
            if(this.getByteT(src1+i, table) != raw[i]) return false;
        }
        return true;
    }
    strcpy(src1, table1, src2, table2) {
        for(let i = 0; true; i++) {
            if(this.getByteT(src1+i, table1) != this.getByteT(src2+i, table2)) return false;
            if(this.getByteT(src1+i, table1) == 0 && this.getByteT(src2+i, table2) == 0) return true;
        }
    }
    strcpy_raw(src, table, str) {
        for(let i = 0; true; i++) {
            if(this.getByteT(src+i, table) == str.charCodeAt(i)) {
                if(this.getByteT(src+i,table) == 0) return true;
            }
            else return false;
        }
    }

    /*
    * Now, all non-db related functions are implemented, and its time to implement all the db-related.
    * First of all, alloc_table. It will create a new table and place a pointer to it on main 
    * Also, really important thing for creating a file-replica of database; Firstly on main buffer will be placed sizes of pages(16 for a page)
    * Those sizes will be null-terminated, which means that after all the sizes will be placed, 0x00-0x00 will be trailed, 
    * marking an end of page declaration.
    * I have in TODO: number table_allocate(size: number), bool table_insert(key: string, value: string|number|ptr), bool table_delete(key:string),
    *  number|string|ptr table_get(key:string), bool table_delete(id: number)
    */
    /**
     * 
     * @param {number} size 
     */
    alloc_table(size) {
        let index = this.buffer.length;
        this.buffer.push(Buffer.from(new Uint8Array(size)));
        for(let i = 0; i < this.buffer[0].length; i+=2) {
            if(this.getWordT(i, 0) == 0) {
                this.setWordT(i, size, 0);
                break;
            }
        }
        this.setWordT(Math.floor(this.buffer[index].length/2), 0xffff, index);
        return index;
    }

    table_insert(key, value, table) {
        let table_content = this.buffer[table];
        let malloc_ptr = Math.floor(table_content.length / 2);
        let addr = -1;
        for(let i = 0; true; i+=4) {
            if(this.getDWordT(i, table) == 0) {
                addr=  i;
                break;
            }
        }
        let key_ptr = this.cmalloc(key.length, malloc_ptr, table);
        let value_ptr = this.cmalloc(value.length, malloc_ptr, table);
        this.meminsert(key_ptr, key.length, table, Buffer.from(key));
        this.meminsert(value_ptr, value.length, table, Buffer.from(value));
        this.setWordT(addr, key_ptr, table);
        this.setWordT(addr+2, value_ptr, table);
    }
    table_get(key, table) {
        for(let i = 0; true; i += 2) {
            
        }
    }
}

let db = new DataBase("dta.bin");
console.log(db);
let tab = db.alloc_table(256);
console.log(db);
db.table_insert("h", "d", tab);
console.log(db);