const { createApp, ref } = Vue;

const Page = ({
    data() {
        return {
            socket: null,
            tabs: [],
            activeTab : {},
            alert: 'Привет',
            wsConnect: false,
            messengerConnect: true,
            lineBreak: true,
            autoScroll: true,
        }
    },
    watch:{

    },
    created(){
        this.addTab();
    },
    computed:{
        notsubscribed: function(){
            return !this.activeTab.subscribed;
        },
        notconnected: function(){
            return !(this.wsConnect && this.messengerConnect);
        },
        terminalText: function(){
            return this.activeTab.terminal.join('\n');
        },
        wrap: function(){
            if (this.lineBreak){
                return 'soft';
            }
            return 'off';
        },
        tableHeaders: function(){
            headers = [];
            if (this.activeTab.tableData.length) {
                row = this.activeTab.tableData[0];
                for (header in row) {
                    headers.push(header);
                }
            }
            return headers;
        },
    },
    compilerOptions: {
        delimiters: ["[[", "]]"],
    },
    mounted() {
        //this.addTab();
        this.connectWS();
    },
   updated() {

   },
   methods: {
        removeClass: function(tab, class_){
            tab.class = tab.class.replace(class_,'')
            tab.class.trim()
        },
        addClass: function(tab, class_){
            if (!tab.class.includes(class_)){
                tab.class = tab.class + ' ' + class_
            }
        },
        selectTab: function(index){
            for (tab of this.tabs){
                this.removeClass(tab, 'active')
            }
            this.activeTab = this.tabs[index];
            this.removeClass(this.activeTab, 'newData')
            this.addClass(this.activeTab, 'active')
            this.terminalScroll();
        },
        addTab: function(){
            device='';
            commands=['XRQ','DRQ','g v','','','','','','','',''];
            terminal = [];
            tableData = [];
            tableClass = [];
            tab = {
                device: device,
                commands: commands,
                terminal: terminal,
                tableData: tableData,
                tableClass: tableClass,
                class: 'active tab',
                subscribed: false,
                deviceInput: '',
            }
            for (ttab of this.tabs) {
                ttab.class = 'tab';
            }
            this.tabs.push(tab);
            this.activeTab = tab;
        },
        subscribeNow: function(){
            ms = 0;
            for (tab of this.tabs) {
                ms += 250;
                if (tab.subscribed) {
                    tab.subscribed = false;
                    setTimeout(this.messengerCommand,ms,'subscribe', tab.device);
                }
            }
        },
        subscribe: function(){
            if (this.activeTab.deviceInput) {
                hasTab = false;
                for (index in this.tabs){
                    if (this.tabs[index].device===this.activeTab.deviceInput) {
                        hasTab = true;
                        break;
                    }
                }
                if (hasTab) {
                    this.selectTab(index);
                } else {
                    if (this.activeTab.subscribed !== false){
                        this.messengerCommand('unsubscribe ', this.activeTab.device)
                    }
                    setTimeout(this.messengerCommand,500,'subscribe', this.activeTab.deviceInput);
                }
             } else {
                this.activeTab.terminal +='Невозможно подписаться на такой номер контроллера ['+this.activeTab.deviceInput+']!\n';
             }
        },
        getdevice: function(message){
            regExp = /\[(?<device>\d+)\]/g;
            match = regExp.exec(message)
            if (match) {
                return match.groups.device;
            } else {
                return null;
            }
        },
        parse: function(message){
            let device = this.getdevice(message);
            if (device){
                if (message.indexOf('set p')>-1) {
                    data = this.parseTableData(message);
                    if (data) {
                        this.setDataToDevice(data, device);
                    }
                }
                if (message.indexOf('unsubscribed')>-1) {
                    this.unsubscribeTabs(device);
                } else {
                    if (message.indexOf('ubscribed')>-1) {
                        this.subscribeTabs(device);
                    }
                }
            } else {
                if (message.indexOf('Failed connect to messenger')>-1) {
                    this.messengerConnect=false;
                }
                if (message.indexOf('Connected to messenger')>-1) {
                    this.messengerConnect=true;
                    this.subscribeNow();
                }
            }
        },
        calcTableClass: function(current, prev){
            classes = {}
            if (prev) {
                for (key in current){
                    if (current[key]==prev[key]) {
                        classes[key]='equal';
                    } else {
                        classes[key]='notequal';
                    }
                }
             } else {
                for (key in current){
                    classes[key]='notequal';
                }
             }
             return classes;
        },
        setDataToDevice: function(data, device){
            for (tab of this.tabs){
                if (tab.device == device) {
                    if (tab.tableData.length) {
                        prev = tab.tableData.at(-1);
                    } else {
                        prev = null;
                    }
                    tab.tableData.push(data);
                    tab.tableClass.push(this.calcTableClass(data, prev));
                }
            }
        },
        parseTableData: function(message){
            mess = message.split(' > set ');
            if (mess.length) {
                timeDevice = mess[0].split(': ');
                time = timeDevice[0];
                readings = mess[1].split(' ');
                data = {};
                data['Время']=time;
                for (reading of readings) {
                    titleVal = reading.split('=');
                    title = titleVal[0];
                    val =  titleVal[1];
                    data[title]=val;
                }
                return data;
            } else {
                return null;
            }
        },
        unsubscribeTabs: function(device){
            for (tab of this.tabs){
                if (tab.device == device) {
                    tab.subscribed = false;
                    tab.device = '';
                }
            }
        },
        subscribeTabs: function(device){
            for (tab of this.tabs){
                if (tab.deviceInput == device) {
                    tab.subscribed = true;
                    tab.device = device;
                }
            }
        },
        truncate: function(arr,length=100){
            if (arr.length>length){
                arr.shift();
            }
            return arr
        },
        scroll: function(el){
            el.scrollTop = el.scrollHeight - el.clientHeight;
        },
        print: function(message){
            let now = new Date();
            let device = this.getdevice(message);
             if (device) {
                for (tab of this.tabs){
                    if ((tab.device == device && tab.subscribed) || (tab.deviceInput == device && !tab.subscribed))  {
                        this.truncate(tab.terminal);
                        tab.terminal.push(formatdate(now) + ' - ' + message.trim());
                        this.addClass(tab, 'newData')
                        if (tab==this.activeTab) {
                            setTimeout(this.removeClass, 1000, this.activeTab, 'newData')
                        }
                    }
                }
                if (this.autoScroll){
//                    setTimeout(this.terminalScroll,100)
                    setTimeout(this.scroll,100, terminalTA);
                    setTimeout(this.scroll,100, tData);
                }
             } else {
                this.printAll(message);
            }
        },
        printAll: function(message){
            let now = new Date();
            for (tab of this.tabs){
                this.truncate(tab.terminal);
                tab.terminal.push('*'+formatdate(now) + ' - ' + message.trim())
            }
            if (this.autoScroll){
                setTimeout(this.terminalScroll,100)
            }
        },
        messengerCommand: function (command, device = null){
            data = {
                messengerCommand: command,
                device: device,
                user: USER,
            }
            this.send(data);
        },
        deviceCommand: function (device, command){
            data = {
                device: device,
                command: command,
                user: USER,
            }
            this.send(data);
        },
        send: function(data){
            let json = JSON.stringify(data);
            this.socket.send(json);
        },
        run: function(index){
            command = this.activeTab.commands[index];
            device = this.activeTab.device;
            this.deviceCommand(device, command);
        },
        connectWS: function(){
            if (this.socket && !this.wsConnect) {
                this.socket.close();
            }
            this.print('Попытка подключения к WebSocket.')
            this.socket = new WebSocket("ws://127.0.0.1:9090");
            this.socket.onopen = function() {
                MyApp.printAll('Подключение к WebSocket установлено.');
                MyApp.wsConnect = true;
                MyApp.subscribeNow();
            };

            this.socket.onclose = function(event) {
                if (event.wasClean) {
                    MyApp.printAll('Соединение закрыто чисто');
                } else {
                    MyApp.printAll('Обрыв соединения'); // например, "убит" процесс сервера
                }
                MyApp.wsConnect = false;
                MyApp.printAll('Код: ' + event.code + ' причина: ' + event.reason);
                setTimeout(MyApp.connectWS,5000);
            };

            this.socket.onmessage = function(event) {
                MyApp.parse(event.data);
                MyApp.print(event.data);
            };

            this.socket.onerror = function(error) {
                MyApp.printAll("Ошибка " + error.message);
                //setTimeout(MyApp.connectWS,1000);
            };
        },
        clearTerminal: function(){
            this.activeTab.terminal=[];
        },
   }
})

window.onload = function() {
    MyApp = createApp(Page).mount('#layout');
}
