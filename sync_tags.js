import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const ARTICLE_DB_ID = process.env.DATABASE_ID;

// 你的配置
const TARGET_RELATION_NAME = "Tag"; // 你认为的关联属性名
const TARGET_SELECT_NAME = "tags";  // 你认为的多选属性名

async function runDiagnosis() {
    console.log("👨‍⚕️ 开始诊断数据库结构...");
    console.log(`🎯 目标数据库 ID: ${ARTICLE_DB_ID}`);

    try {
        const response = await notion.databases.query({
            database_id: ARTICLE_DB_ID,
            page_size: 1, // 只取 1 篇来看看结构
        });

        if (response.results.length === 0) {
            console.log("⚠️ 数据库是空的，没法诊断。请至少创建一篇文章。");
            return;
        }

        const page = response.results[0];
        const props = page.properties;
        
        console.log("\n========================================");
        console.log(`📝 正在分析文章: "${page.id}"`);
        console.log("========================================");
        console.log("🔍 发现以下属性 (Property Name -> Type):");
        
        const allKeys = Object.keys(props);
        let foundRelation = false;
        let foundSelect = false;

        allKeys.forEach(key => {
            const type = props[key].type;
            console.log(`   - [${key}]: ${type}`);

            if (key === TARGET_RELATION_NAME) foundRelation = true;
            if (key === TARGET_SELECT_NAME) foundSelect = true;
        });

        console.log("\n----------------------------------------");
        console.log("📋 匹配检查结果:");
        
        if (foundRelation) {
            console.log(`✅ 关联属性 "${TARGET_RELATION_NAME}" 存在！`);
            // 深入检查一下这个关联属性的数据结构
            const relationData = props[TARGET_RELATION_NAME];
            console.log("   数据结构预览:", JSON.stringify(relationData, null, 2));
        } else {
            console.log(`❌ 关联属性 "${TARGET_RELATION_NAME}" 未找到！`);
            console.log("   👉 可能原因：名字拼写错误（注意大小写）、空格，或者根本没创建这个属性。");
            console.log("   👉 请从上面的列表里复制真实的名字。");
        }

        if (foundSelect) {
            console.log(`✅ 多选属性 "${TARGET_SELECT_NAME}" 存在！`);
        } else {
            console.log(`❌ 多选属性 "${TARGET_SELECT_NAME}" 未找到！`);
            console.log("   👉 请检查上面的列表，看看它到底叫什么。");
        }
        console.log("----------------------------------------\n");

    } catch (e) {
        console.error("💥 诊断过程发生错误:", e);
    }
}

runDiagnosis();
