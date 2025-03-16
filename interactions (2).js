const { ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Database = require("better-sqlite3");
const { getEmojiForQuestion } = require("./utils");

// إعداد قاعدة البيانات
const db = new Database("./faq_database.db", { verbose: console.log });

// إنشاء الجداول إذا لم تكن موجودة
db.exec(`
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        label TEXT
    );
    CREATE TABLE IF NOT EXISTS faqs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        section_name TEXT,
        question TEXT,
        answer TEXT,
        FOREIGN KEY (section_name) REFERENCES sections(name)
    );
`);

// تهيئة البيانات الافتراضية إذا كانت القاعدة فارغة
const sectionCount = db.prepare("SELECT COUNT(*) as count FROM sections").get().count;
if (sectionCount === 0) {
    const insertSection = db.prepare("INSERT INTO sections (name, label) VALUES (?, ?)");
    const insertFaq = db.prepare("INSERT INTO faqs (section_name, question, answer) VALUES (?, ?, ?)");

    insertSection.run("gaming", "الألعاب");
    insertFaq.run("gaming", "best_games", "أفضل الألعاب هي: Elden Ring، GTA V، و The Witcher 3!");
    insertFaq.run("gaming", "pro_tips", "نصيحة احترافية: تدرب يوميًا وتابع المحترفين في مجالك!");

    insertSection.run("coding", "البرمجة");
    insertFaq.run("coding", "best_languages", "أفضل لغات البرمجة: Python، JavaScript، و Rust!");
    insertFaq.run("coding", "how_to_start", "ابدأ بتعلم الأساسيات من مصادر مجانية مثل freeCodeCamp و CS50!");

    insertSection.run("design", "التصميم");
    insertFaq.run("design", "best_design_tools", "أفضل برامج التصميم: Photoshop، Illustrator، و Figma!");
    insertFaq.run("design", "beginner_tips", "نصيحة للمبتدئين: لا تستعجل، مارس التصميم يوميًا وابدأ بمشاريع بسيطة!");
}

async function setupChannels(client, channelId, adminChannelId) {
    console.time("setupChannels");
    let publicChannel = null;
    let adminChannel = null;
    try {
        publicChannel = await client.channels.fetch(channelId);
        adminChannel = await client.channels.fetch(adminChannelId);
        if (!publicChannel) throw new Error(`❌ فشل في استرجاع القناة العامة (${channelId})`);
        if (!adminChannel) throw new Error(`❌ فشل في استرجاع قناة الإدارة (${adminChannelId})`);
    } catch (error) {
        console.error("❌ خطأ أثناء إعداد القنوات:", error.message);
        throw error;
    }
    console.timeEnd("setupChannels");
    return { publicChannel, adminChannel };
}

async function handleMessage(message) {
    console.time("handleMessage");
    if (message.channel.id !== process.env.CHANNEL_ID || message.author.bot) {
        console.timeEnd("handleMessage");
        return;
    }

    const embed = new EmbedBuilder()
        .setColor("#0099ff")
        .setTitle(" يا هلا بك كيف يمكنني مساعدتك ؟❓")
        .setDescription("📜 يرجى اختيار القسم من القائمة أدناه للحصول على الأسئلة الشائعة المتعلقة به.")
        .setTimestamp();

    const sections = db.prepare("SELECT name, label FROM sections").all();
    const sectionsMenu = new StringSelectMenuBuilder()
        .setCustomId("select_section")
        .setPlaceholder("📂 اختر القسم")
        .addOptions(sections.map(section => ({ label: section.label, value: section.name })));

    const row = new ActionRowBuilder().addComponents(sectionsMenu);

    await message.reply({ embeds: [embed], components: [row] });
    console.timeEnd("handleMessage");
}

async function handleInteraction(interaction, publicChannel, adminChannel) {
    console.time("handleInteraction");

    try {
        // ✅ اختيار القسم
        if (interaction.isStringSelectMenu() && interaction.customId === "select_section") {
            console.time("selectSection");
            const selectedSection = interaction.values[0];
            const faqs = db.prepare("SELECT question, answer FROM faqs WHERE section_name = ?").all(selectedSection);

            if (faqs.length <= 25) {
                const faqMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_faq_${selectedSection}`)
                    .setPlaceholder("📝 اختر سؤالك")
                    .addOptions(faqs.map(faq => ({
                        label: faq.question.replace(/_/g, " ").toUpperCase(),
                        value: faq.question
                    })));

                const row = new ActionRowBuilder().addComponents(faqMenu);
                await interaction.reply({ content: "❓ اختر سؤالك:", components: [row], ephemeral: true });
            } else {
                const pageSize = 24;
                const page = interaction.customId.includes("_page_") ? parseInt(interaction.customId.split("_page_")[1]) : 0;
                const totalPages = Math.ceil(faqs.length / pageSize);

                const start = page * pageSize;
                const end = start + pageSize;
                const faqPage = faqs.slice(start, end);

                const faqMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_faq_${selectedSection}_page_${page}`)
                    .setPlaceholder(`📝 اختر سؤالك (الصفحة ${page + 1} من ${totalPages})`)
                    .addOptions(faqPage.map(faq => ({
                        label: faq.question.replace(/_/g, " ").toUpperCase(),
                        value: faq.question
                    })));

                if (page < totalPages - 1) {
                    faqMenu.addOptions({ label: "➡️ الصفحة التالية", value: "next_page" });
                }
                if (page > 0) {
                    faqMenu.addOptions({ label: "⬅️ الصفحة السابقة", value: "prev_page" });
                }

                const row = new ActionRowBuilder().addComponents(faqMenu);
                await interaction.reply({ content: "❓ اختر سؤالك:", components: [row], ephemeral: true });
            }
            console.timeEnd("selectSection");
        }

        // ✅ اختيار السؤال أو التنقل بين الصفحات
        if (interaction.isStringSelectMenu() && interaction.customId.startsWith("select_faq")) {
            console.time("selectFaq");
            const selectedValue = interaction.values[0];
            const parts = interaction.customId.split("_");
            const selectedSection = parts[2];

            if (selectedValue === "next_page" || selectedValue === "prev_page") {
                const currentPage = parts.length > 4 ? parseInt(parts[4]) : 0;
                const newPage = selectedValue === "next_page" ? currentPage + 1 : currentPage - 1;
                const faqs = db.prepare("SELECT question, answer FROM faqs WHERE section_name = ?").all(selectedSection);

                const pageSize = 24;
                const totalPages = Math.ceil(faqs.length / pageSize);
                const start = newPage * pageSize;
                const end = start + pageSize;
                const faqPage = faqs.slice(start, end);

                const faqMenu = new StringSelectMenuBuilder()
                    .setCustomId(`select_faq_${selectedSection}_page_${newPage}`)
                    .setPlaceholder(`📝 اختر سؤالك (الصفحة ${newPage + 1} من ${totalPages})`)
                    .addOptions(faqPage.map(faq => ({
                        label: faq.question.replace(/_/g, " ").toUpperCase(),
                        value: faq.question
                    })));

                if (newPage < totalPages - 1) {
                    faqMenu.addOptions({ label: "➡️ الصفحة التالية", value: "next_page" });
                }
                if (newPage > 0) {
                    faqMenu.addOptions({ label: "⬅️ الصفحة السابقة", value: "prev_page" });
                }

                const row = new ActionRowBuilder().addComponents(faqMenu);
                await interaction.update({ content: "❓ اختر سؤالك:", components: [row] });
            } else {
                const faq = db.prepare("SELECT answer FROM faqs WHERE question = ?").get(selectedValue);
                const response = faq ? faq.answer : "❌ لم أجد إجابة لهذا السؤال!";

                await interaction.deferReply();
                await interaction.editReply({ content: `<@${interaction.user.id}> ${response}`, components: [] });

                const feedbackButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`feedback_yes_${selectedValue}_${interaction.user.id}`)
                        .setLabel("✅ نعم")
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId(`feedback_no_${selectedValue}_${interaction.user.id}`)
                        .setLabel("❌ لا")
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId(`another_question_${selectedSection}_${interaction.user.id}`)
                        .setLabel("❓ هل لديك سؤال آخر؟")
                        .setStyle(ButtonStyle.Primary)
                );

                await interaction.followUp({ content: "💡 هل أفادك هذا السؤال؟", components: [feedbackButtons], ephemeral: true });
            }
            console.timeEnd("selectFaq");
        }

        // ✅ التعامل مع الأزرار
        if (interaction.isButton()) {
            const [action, , value, userId] = interaction.customId.split("_");

            if (interaction.customId.startsWith("feedback_yes")) {
                console.time("feedbackYes");
                await interaction.deferUpdate();
                await interaction.editReply({ content: "✅ شكرًا على تقييمك! يسعدنا أن الإجابة أفادتك.", components: [], ephemeral: true });
                console.timeEnd("feedbackYes");
            }

            if (interaction.customId.startsWith("feedback_no")) {
                console.time("feedbackNo");
                const modal = new ModalBuilder()
                    .setCustomId(`feedback_modal_${value}_${interaction.user.id}`)
                    .setTitle("💬 تقديم اقتراح أو سؤال جديد");

                const suggestionInput = new TextInputBuilder()
                    .setCustomId("suggestion_input")
                    .setLabel("✍️ اكتب سؤالك أو اقتراحك هنا")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder("مثال: ما هي أفضل ألعاب 2025؟");

                const row = new ActionRowBuilder().addComponents(suggestionInput);
                modal.addComponents(row);

                await interaction.showModal(modal);
                console.timeEnd("feedbackNo");
            }

            if (interaction.customId.startsWith("another_question")) {
                console.time("anotherQuestion");
                const selectedSection = value;
                const faqs = db.prepare("SELECT question, answer FROM faqs WHERE section_name = ?").all(selectedSection);

                if (faqs.length <= 25) {
                    const faqMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_faq_${selectedSection}`)
                        .setPlaceholder("📝 اختر سؤالك")
                        .addOptions(faqs.map(faq => ({
                            label: faq.question.replace(/_/g, " ").toUpperCase(),
                            value: faq.question
                        })));

                    const row = new ActionRowBuilder().addComponents(faqMenu);
                    await interaction.update({ content: "❓ اختر سؤالك الآخر:", components: [row] });
                } else {
                    const pageSize = 24;
                    const page = 0;
                    const totalPages = Math.ceil(faqs.length / pageSize);
                    const faqPage = faqs.slice(0, pageSize);

                    const faqMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_faq_${selectedSection}_page_${page}`)
                        .setPlaceholder(`📝 اختر سؤالك (الصفحة ${page + 1} من ${totalPages})`)
                        .addOptions(faqPage.map(faq => ({
                            label: faq.question.replace(/_/g, " ").toUpperCase(),
                            value: faq.question
                        })));

                    if (totalPages > 1) {
                        faqMenu.addOptions({ label: "➡️ الصفحة التالية", value: "next_page" });
                    }

                    const row = new ActionRowBuilder().addComponents(faqMenu);
                    await interaction.update({ content: "❓ اختر سؤالك الآخر:", components: [row] });
                }
                console.timeEnd("anotherQuestion");
            }

            if (interaction.customId.startsWith("reply_to_question")) {
                console.time("replyToQuestion");
                const [, , userId, selectedQuestion] = interaction.customId.split("_");
                const replyModal = new ModalBuilder()
                    .setCustomId(`reply_modal_${userId}_${selectedQuestion}`)
                    .setTitle("✍️ كتابة الإجابة");

                const userIdInput = new TextInputBuilder()
                    .setCustomId("user_id_input")
                    .setLabel("🆔 معرف المستخدم (User ID)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder("مثال: 123456789012345678");

                const replyInput = new TextInputBuilder()
                    .setCustomId("reply_input")
                    .setLabel("📝 اكتب الإجابة هنا")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setPlaceholder("اكتب الإجابة التي تريد إرسالها للمستخدم...");

                const row1 = new ActionRowBuilder().addComponents(userIdInput);
                const row2 = new ActionRowBuilder().addComponents(replyInput);
                replyModal.addComponents(row1, row2);

                await interaction.showModal(replyModal);
                console.timeEnd("replyToQuestion");
            }
        }

        // ✅ التعامل مع المودال (سؤال المستخدم)
        if (interaction.isModalSubmit() && interaction.customId.startsWith("feedback_modal")) {
            console.time("feedbackModal");
            const suggestion = interaction.fields.getTextInputValue("suggestion_input");
            const [, , selectedQuestion] = interaction.customId.split("_");

            await interaction.reply({ content: "📨 شكرا على سوالك سيتم مراجعته يحتاج بعض الوقت .", ephemeral: true });

            if (adminChannel) {
                const embed = new EmbedBuilder()
                    .setColor("#ff0000")
                    .setTitle("📬 اقتراح أو سؤال جديد")
                    .addFields(
                        { name: "👤 اسم المستخدم", value: interaction.user.tag, inline: true },
                        { name: "🆔 معرف المستخدم", value: interaction.user.id, inline: true },
                        { name: "❓ السؤال المختار", value: selectedQuestion, inline: true },
                        { name: "💬 الاقتراح/السؤال", value: suggestion }
                    )
                    .setTimestamp();

                const replyButton = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`reply_to_question_${interaction.user.id}_${selectedQuestion}`)
                        .setLabel("📝 الرد على السؤال")
                        .setStyle(ButtonStyle.Primary)
                );

                await adminChannel.send({ embeds: [embed], components: [replyButton] });
            }
            console.timeEnd("feedbackModal");
        }

        // ✅ التعامل مع المودال (إجابة الإدارة)
        if (interaction.isModalSubmit() && interaction.customId.startsWith("reply_modal")) {
            console.time("replyModal");
            const userId = interaction.fields.getTextInputValue("user_id_input");
            const reply = interaction.fields.getTextInputValue("reply_input");
            const [, , , selectedQuestion] = interaction.customId.split("_");

            await interaction.reply({ content: "📤 تم إرسال الإجابة إلى القناة العامة والخاص!", ephemeral: true });

            if (publicChannel) {
                const emoji = getEmojiForQuestion(selectedQuestion);
                await publicChannel.send(`<@${userId}> ${emoji} ${reply}`);
            }

            try {
                const targetUser = await interaction.client.users.fetch(userId);
                const channelMention = `<#${process.env.CHANNEL_ID}>`;
                await targetUser.send(`📩 تم الرد على سؤالك في ${channelMention}! الإجابة: ${reply}`);
            } catch (error) {
                console.error("❌ فشل في إرسال الإشعار في الخاص:", error);
            }
            console.timeEnd("replyModal");
        }

        // ✅ Slash Commands للإدارة
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        const isAdmin = interaction.member && interaction.member.roles.cache.has(adminRoleId);

        if (interaction.isCommand() && !isAdmin) {
            await interaction.reply({ content: "❌ ليس لديك صلاحية استخدام هذا الأمر!", ephemeral: true });
            return;
        }

        // إضافة قسم جديد
        if (interaction.isCommand() && interaction.commandName === "addcat") {
            console.time("addCat");
            const catName = interaction.options.getString("name");
            const label = interaction.options.getString("label");
            try {
                db.prepare("INSERT INTO sections (name, label) VALUES (?, ?)").run(catName, label);
                await interaction.reply({ content: `✅ تم إضافة القسم "${catName}" بنجاح!`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: "❌ هذا القسم موجود بالفعل!", ephemeral: true });
            }
            console.timeEnd("addCat");
        }

        // إضافة سؤال شائع
        if (interaction.isCommand() && interaction.commandName === "addfaq") {
            console.time("addFaq");
            const catName = interaction.options.getString("cat_name");
            const sectionExists = db.prepare("SELECT COUNT(*) as count FROM sections WHERE name = ?").get(catName).count;
            if (!sectionExists) {
                await interaction.reply({ content: "❌ هذا القسم غير موجود!", ephemeral: true });
                console.timeEnd("addFaq");
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId(`add_faq_modal_${catName}_${interaction.user.id}`)
                .setTitle("➕ إضافة سؤال شائع");

            const questionInput = new TextInputBuilder()
                .setCustomId("question_input")
                .setLabel("❓ السؤال")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setPlaceholder("مثال: ما هي أفضل ألعاب 2025؟");

            const answerInput = new TextInputBuilder()
                .setCustomId("answer_input")
                .setLabel("📝 الإجابة")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setPlaceholder("اكتب الإجابة هنا...");

            const row1 = new ActionRowBuilder().addComponents(questionInput);
            const row2 = new ActionRowBuilder().addComponents(answerInput);
            modal.addComponents(row1, row2);

            await interaction.showModal(modal);
            console.timeEnd("addFaq");
        }

        // التعامل مع Modal إضافة السؤال الشائع
        if (interaction.isModalSubmit() && interaction.customId.startsWith("add_faq_modal")) {
            console.time("addFaqModal");
            const [_, catName] = interaction.customId.split("_").slice(2);
            const question = interaction.fields.getTextInputValue("question_input").toLowerCase().replace(/\s+/g, "_");
            const answer = interaction.fields.getTextInputValue("answer_input");

            try {
                db.prepare("INSERT INTO faqs (section_name, question, answer) VALUES (?, ?, ?)").run(catName, question, answer);
                await interaction.reply({ content: `✅ تم إضافة السؤال "${question}" إلى قسم "${catName}" بنجاح!`, ephemeral: true });
            } catch (error) {
                await interaction.reply({ content: "❌ هذا السؤال موجود بالفعل في القسم!", ephemeral: true });
            }
            console.timeEnd("addFaqModal");
        }

        // حذف قسم
        if (interaction.isCommand() && interaction.commandName === "deletecat") {
            console.time("deleteCat");
            const catName = interaction.options.getString("cat_name");
            const sectionExists = db.prepare("SELECT COUNT(*) as count FROM sections WHERE name = ?").get(catName).count;
            if (!sectionExists) {
                await interaction.reply({ content: "❌ هذا القسم غير موجود!", ephemeral: true });
            } else {
                db.prepare("DELETE FROM faqs WHERE section_name = ?").run(catName);
                db.prepare("DELETE FROM sections WHERE name = ?").run(catName);
                await interaction.reply({ content: `🗑️ تم حذف القسم "${catName}" وجميع أسئلته بنجاح!`, ephemeral: true });
            }
            console.timeEnd("deleteCat");
        }

        // حذف سؤال شائع
        if (interaction.isCommand() && interaction.commandName === "deletefaq") {
            console.time("deleteFaq");
            const catName = interaction.options.getString("cat_name");
            const question = interaction.options.getString("question");
            const faqExists = db.prepare("SELECT COUNT(*) as count FROM faqs WHERE section_name = ? AND question = ?").get(catName, question).count;
            if (!faqExists) {
                await interaction.reply({ content: "❌ هذا السؤال غير موجود في القسم!", ephemeral: true });
            } else {
                db.prepare("DELETE FROM faqs WHERE section_name = ? AND question = ?").run(catName, question);
                await interaction.reply({ content: `🗑️ تم حذف السؤال "${question}" من قسم "${catName}" بنجاح!`, ephemeral: true });
            }
            console.timeEnd("deleteFaq");
        }

        // تعديل قسم
        if (interaction.isCommand() && interaction.commandName === "editcat") {
            console.time("editCat");
            const catName = interaction.options.getString("cat_name");
            const newName = interaction.options.getString("new_name");
            const newLabel = interaction.options.getString("new_label");
            const sectionExists = db.prepare("SELECT COUNT(*) as count FROM sections WHERE name = ?").get(catName).count;
            if (!sectionExists) {
                await interaction.reply({ content: "❌ هذا القسم غير موجود!", ephemeral: true });
            } else {
                db.prepare("UPDATE sections SET name = ?, label = ? WHERE name = ?").run(newName, newLabel, catName);
                db.prepare("UPDATE faqs SET section_name = ? WHERE section_name = ?").run(newName, catName);
                await interaction.reply({ content: `✏️ تم تعديل القسم من "${catName}" إلى "${newName}" بنجاح!`, ephemeral: true });
            }
            console.timeEnd("editCat");
        }

        // تعديل سؤال شائع
        if (interaction.isCommand() && interaction.commandName === "editfaq") {
            console.time("editFaq");
            const catName = interaction.options.getString("cat_name");
            const question = interaction.options.getString("question");
            const newAnswer = interaction.options.getString("new_answer");
            const faqExists = db.prepare("SELECT COUNT(*) as count FROM faqs WHERE section_name = ? AND question = ?").get(catName, question).count;
            if (!faqExists) {
                await interaction.reply({ content: "❌ هذا السؤال غير موجود في القسم!", ephemeral: true });
            } else {
                db.prepare("UPDATE faqs SET answer = ? WHERE section_name = ? AND question = ?").run(newAnswer, catName, question);
                await interaction.reply({ content: `✏️ تم تعديل إجابة السؤال "${question}" في قسم "${catName}" بنجاح!`, ephemeral: true });
            }
            console.timeEnd("editFaq");
        }

        // إعادة تعيين قاعدة البيانات
        if (interaction.isCommand() && interaction.commandName === "resetdb") {
            console.time("resetDb");
            db.prepare("DELETE FROM faqs").run();
            db.prepare("DELETE FROM sections").run();
            await interaction.reply({ content: "🗑️ تم مسح جميع الأقسام والأسئلة الشائعة من قاعدة البيانات بنجاح!", ephemeral: true });
            console.timeEnd("resetDb");
        }

    } catch (error) {
        console.error("❌ حدث خطأ أثناء التفاعل:", error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: "❌ جاري اضافة العديد من الاسئله الشائعه, انا لسا .", ephemeral: true });
        }
    }
    console.timeEnd("handleInteraction");
}

module.exports = { setupChannels, handleMessage, handleInteraction };