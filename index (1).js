require("dotenv").config();
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.DirectMessages, GatewayIntentBits.GuildMembers]
});

let publicChannel = null;
let adminChannel = null;

const { setupChannels, handleMessage, handleInteraction } = require("./interactions");

// تسجيل Slash Commands
const commands = [
    {
        name: "addcat",
        description: "إضافة قسم جديد",
        options: [
            { name: "name", type: 3, description: "اسم القسم (بالإنجليزية)", required: true },
            { name: "label", type: 3, description: "العنوان المعروض (مثل: الألعاب)", required: true }
        ]
    },
    {
        name: "addfaq",
        description: "إضافة سؤال شائع لقسم معين",
        options: [
            { name: "cat_name", type: 3, description: "اسم القسم", required: true }
        ]
    },
    {
        name: "deletecat",
        description: "حذف قسم وجميع أسئلته",
        options: [
            { name: "cat_name", type: 3, description: "اسم القسم", required: true }
        ]
    },
    {
        name: "deletefaq",
        description: "حذف سؤال شائع من قسم",
        options: [
            { name: "cat_name", type: 3, description: "اسم القسم", required: true },
            { name: "question", type: 3, description: "اسم السؤال", required: true }
        ]
    },
    {
        name: "editcat",
        description: "تعديل اسم وعنوان قسم",
        options: [
            { name: "cat_name", type: 3, description: "اسم القسم الحالي", required: true },
            { name: "new_name", type: 3, description: "اسم القسم الجديد", required: true },
            { name: "new_label", type: 3, description: "العنوان الجديد", required: true }
        ]
    },
    {
        name: "editfaq",
        description: "تعديل إجابة سؤال شائع",
        options: [
            { name: "cat_name", type: 3, description: "اسم القسم", required: true },
            { name: "question", type: 3, description: "اسم السؤال", required: true },
            { name: "new_answer", type: 3, description: "الإجابة الجديدة", required: true }
        ]
    },
    {
        name: "resetdb",
        description: "مسح جميع الأقسام والأسئلة الشائعة من قاعدة البيانات",
    }
];

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("ready", async () => {
    console.log(`Logged in as ${client.user.tag}`);
    try {
        const channels = await setupChannels(client, process.env.CHANNEL_ID, process.env.ADMIN_CHANNEL_ID);
        publicChannel = channels.publicChannel;
        adminChannel = channels.adminChannel;

        if (publicChannel && adminChannel) {
            console.log("القنوات تم استرجاعها بنجاح");
            console.log(`القناة العامة: ${publicChannel.name} (${publicChannel.id})`);
            console.log(`قناة الإدارة: ${adminChannel.name} (${adminChannel.id})`);
        }

        // تسجيل الأوامر
        await rest.put(Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID), { body: commands });
        console.log("تم تسجيل Slash Commands بنجاح");

        client.on("interactionCreate", (interaction) => handleInteraction(interaction, publicChannel, adminChannel));
    } catch (error) {
        console.error("خطأ أثناء الإعداد:", error);
    }
});

client.on("messageCreate", handleMessage);

process.on("unhandledRejection", (error) => console.error("خطأ غير متوقع:", error));
process.on("uncaughtException", (error) => console.error("خطأ غير متوقع (uncaughtException):", error));

client.login(process.env.TOKEN);